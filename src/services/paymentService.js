/**
 * Payment Service - אינטגרציה עם Hyp Pay
 *
 * תזרים תשלום:
 * 1. holdCredit() - תפיסת מסגרת (Postpone) - בעת יצירת הזמנה
 * 2. capturePayment() - גביה בפועל (Commit) - כשכל הפריטים הוכרעו
 * 3. cancelTransaction() - ביטול מסגרת - אם הכל בוטל
 *
 * מצבי תשלום:
 * - pending: ממתין לתשלום
 * - hold: מסגרת נתפסה (postpone)
 * - ready_to_charge: מוכן לגביה (כל פריט הוכרע)
 * - charged: נגבה בהצלחה
 * - cancelled: בוטל
 */

import { sendRequest, isSuccessCode, getErrorMessage, validateCardDetails } from '../utils/hypPayClient.js';

/**
 * ✅ Phase 6.5.2: Retry Mechanism Helpers
 */

/**
 * בודק אם שגיאה ניתנת לניסיון חוזר
 * @param {Object} error - אובייקט שגיאה או תשובה מ-Hyp Pay
 * @returns {boolean}
 */
function isRetryableError(error) {
  // HTTP status codes שניתן לנסות שוב
  const retryableStatuses = [408, 429, 500, 502, 503, 504];

  // הודעות שגיאה שמעידות על בעיה זמנית
  const retryableMessages = ['timeout', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'network'];

  // בדיקת status code
  if (error.statusCode && retryableStatuses.includes(error.statusCode)) {
    return true;
  }

  // בדיקת Hyp Pay CCode
  if (error.CCode || error.code) {
    const code = error.CCode || error.code;
    // כל קוד שגיאה מעל 500 הוא בעיה בשרת
    if (typeof code === 'string' || typeof code === 'number') {
      const numCode = parseInt(code);
      if (!isNaN(numCode) && numCode >= 500) {
        return true;
      }
    }
  }

  // בדיקת הודעה
  const message = error.message || error.error || '';
  if (retryableMessages.some(msg => message.toLowerCase().includes(msg))) {
    return true;
  }

  return false;
}

/**
 * חישוב זמן המתנה לניסיון הבא (exponential backoff)
 * @param {number} retryCount - מספר הניסיון הנוכחי
 * @returns {number} דקות המתנה
 */
function calculateBackoff(retryCount) {
  // 5min, 10min, 20min, 40min, 80min
  return Math.pow(2, retryCount) * 5;
}

/**
 * תפיסת מסגרת אשראי (Postpone)
 * נקרא בעת יצירת הזמנה - לא גובה, רק תופס מסגרת
 *
 * @param {Object} order - הזמנה
 * @param {Object} paymentDetails - פרטי תשלום מהלקוח
 * @returns {Promise<Object>}
 */
export async function holdCredit(order, paymentDetails) {
  // ולידציה של פרטי כרטיס
  const validation = validateCardDetails(paymentDetails);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join(', '),
      code: 'VALIDATION_ERROR'
    };
  }

  const params = {
    action: 'soft',
    Amount: Math.round(order.pricing.total * 100) / 100, // 2 ספרות אחרי הנקודה
    Postpone: 'True',  // ← המפתח! לא גובה, רק תופס מסגרת
    Order: order.orderNumber,
    Info: `הזמנה ${order.orderNumber} - ${order.items.length} פריטים`,
    UserId: paymentDetails.userId || order.user?._id?.toString(),
    ClientName: order.shippingAddress?.fullName || 'לקוח',
    email: order.shippingAddress?.email || paymentDetails.email || '',
    phone: order.shippingAddress?.phone || '',
    CC: paymentDetails.cardNumber.replace(/\s/g, ''), // הסר רווחים
    Tmonth: paymentDetails.expMonth,
    Tyear: paymentDetails.expYear,
    cvv: paymentDetails.cvv,
    Coin: '1'  // שקלים
  };

  try {
    const result = await sendRequest(params);

    // CCode=800 = עסקה מושהית בהצלחה
    // CCode=0 = גם תקין (במקרים מסוימים)
    if (isSuccessCode(result.CCode, 'soft')) {
      return {
        success: true,
        transactionId: result.Id,
        amount: order.pricing.total,
        message: 'מסגרת אשראי נתפסה בהצלחה',
        status: 'hold',
        raw: result
      };
    }

    return {
      success: false,
      error: getErrorMessage(result),
      code: result.CCode,
      raw: result
    };
  } catch (error) {
    console.error('[PaymentService] holdCredit error:', error);
    return {
      success: false,
      error: 'תקלה בתקשורת עם שער התשלום',
      code: 'NETWORK_ERROR'
    };
  }
}

/**
 * גביה בפועל (Commit)
 * נקרא כשכל הפריטים הוכרעו (ordered או cancelled)
 *
 * @param {Object} order - הזמנה (populated)
 * @returns {Promise<Object>}
 */
export async function capturePayment(order) {
  // בדיקה שיש transaction ID
  if (!order.payment?.hypTransactionId) {
    return {
      success: false,
      error: 'לא נמצא מזהה עסקה',
      code: 'NO_TRANSACTION_ID'
    };
  }

  // חשב סכום סופי
  const finalAmount = calculateFinalAmount(order);

  // אם הכל בוטל - בטל את המסגרת במקום לגבות
  if (finalAmount === 0) {
    console.log('[PaymentService] All items cancelled, cancelling transaction');
    return await cancelTransaction(order.payment.hypTransactionId);
  }

  const params = {
    action: 'commitTrans',
    TransId: order.payment.hypTransactionId,
    Amount: Math.round(finalAmount * 100) / 100
  };

  try {
    const result = await sendRequest(params);

    // ✅ הצלחה!
    if (isSuccessCode(result.CCode, 'commitTrans')) {
      // איפוס retry counters במקרה של הצלחה
      order.payment.retryCount = 0;
      order.payment.nextRetryAt = null;
      order.payment.lastRetryAt = null;

      return {
        success: true,
        chargedAmount: finalAmount,
        transactionId: result.Id || order.payment.hypTransactionId,
        message: `נגבו ₪${finalAmount} בהצלחה`,
        status: 'charged',
        raw: result
      };
    }

    // ❌ שגיאה - בדוק אם ניתן לנסות שוב
    const error = { code: result.CCode, error: getErrorMessage(result), raw: result };

    if (isRetryableError(error) && order.payment.retryCount < order.payment.maxRetries) {
      // ✅ Phase 6.5.2: תזמן retry
      const backoffMinutes = calculateBackoff(order.payment.retryCount);
      const nextRetryAt = new Date(Date.now() + backoffMinutes * 60000);

      order.payment.retryCount++;
      order.payment.lastRetryAt = new Date();
      order.payment.nextRetryAt = nextRetryAt;
      order.payment.status = 'retry_pending';

      // שמור שגיאה בהיסטוריה
      if (!order.payment.retryErrors) {
        order.payment.retryErrors = [];
      }
      order.payment.retryErrors.push({
        attempt: order.payment.retryCount,
        timestamp: new Date(),
        error: error.error,
        hypStatusCode: parseInt(result.CCode) || null
      });

      console.log(`[PaymentService] ⏳ Scheduling retry ${order.payment.retryCount}/${order.payment.maxRetries} in ${backoffMinutes} minutes`);

      return {
        success: false,
        willRetry: true,
        retryAt: nextRetryAt,
        retryCount: order.payment.retryCount,
        maxRetries: order.payment.maxRetries,
        error: error.error,
        code: result.CCode
      };
    }

    // ❌ נכשל סופית (או הגענו ל-max retries)
    console.error(`[PaymentService] ❌ Payment failed permanently after ${order.payment.retryCount} retries`);

    return {
      success: false,
      willRetry: false,
      error: error.error,
      code: result.CCode,
      raw: result
    };

  } catch (error) {
    console.error('[PaymentService] capturePayment error:', error);

    // בדוק אם זו שגיאת רשת שניתן לנסות שוב
    if (isRetryableError(error) && order.payment.retryCount < order.payment.maxRetries) {
      const backoffMinutes = calculateBackoff(order.payment.retryCount);
      const nextRetryAt = new Date(Date.now() + backoffMinutes * 60000);

      order.payment.retryCount++;
      order.payment.lastRetryAt = new Date();
      order.payment.nextRetryAt = nextRetryAt;
      order.payment.status = 'retry_pending';

      if (!order.payment.retryErrors) {
        order.payment.retryErrors = [];
      }
      order.payment.retryErrors.push({
        attempt: order.payment.retryCount,
        timestamp: new Date(),
        error: error.message,
        hypStatusCode: null
      });

      console.log(`[PaymentService] ⏳ Network error - scheduling retry ${order.payment.retryCount}/${order.payment.maxRetries}`);

      return {
        success: false,
        willRetry: true,
        retryAt: nextRetryAt,
        retryCount: order.payment.retryCount,
        error: error.message,
        code: 'NETWORK_ERROR'
      };
    }

    return {
      success: false,
      willRetry: false,
      error: 'תקלה בגביית התשלום',
      code: 'NETWORK_ERROR'
    };
  }
}

/**
 * ביטול עסקה (אם הכל בוטל או לפי בקשת לקוח)
 *
 * @param {String} transactionId - מזהה עסקה מ-Hyp Pay
 * @returns {Promise<Object>}
 */
export async function cancelTransaction(transactionId) {
  if (!transactionId) {
    return {
      success: false,
      error: 'לא נמצא מזהה עסקה',
      code: 'NO_TRANSACTION_ID'
    };
  }

  const params = {
    action: 'CancelTrans',
    TransId: transactionId
  };

  try {
    const result = await sendRequest(params);

    if (isSuccessCode(result.CCode, 'CancelTrans')) {
      return {
        success: true,
        cancelled: true,
        message: 'מסגרת האשראי בוטלה בהצלחה',
        status: 'cancelled',
        raw: result
      };
    }

    return {
      success: false,
      error: getErrorMessage(result),
      code: result.CCode,
      raw: result
    };
  } catch (error) {
    console.error('[PaymentService] cancelTransaction error:', error);
    return {
      success: false,
      error: 'תקלה בביטול העסקה',
      code: 'NETWORK_ERROR'
    };
  }
}

/**
 * בדיקת סטטוס עסקה (query)
 * שימושי לוודא שעסקה עדיין פעילה ולא פגה
 *
 * @param {String} transactionId - מזהה עסקה
 * @returns {Promise<Object>}
 */
export async function queryTransaction(transactionId) {
  if (!transactionId) {
    return {
      exists: false,
      error: 'לא נמצא מזהה עסקה'
    };
  }

  const params = {
    action: 'QueryTrans',
    TransId: transactionId
  };

  try {
    const result = await sendRequest(params);

    return {
      exists: isSuccessCode(result.CCode, 'QueryTrans'),
      status: result.Status,
      amount: result.Amount,
      transactionId: result.Id || transactionId,
      raw: result
    };
  } catch (error) {
    console.error('[PaymentService] queryTransaction error:', error);
    return {
      exists: false,
      error: 'תקלה בבדיקת סטטוס העסקה'
    };
  }
}

/**
 * חישוב סכום סופי לגביה
 * רק פריטים שהוזמנו (לא בוטלו)
 *
 * @param {Object} order - הזמנה
 * @returns {Number} סכום לגביה
 */
function calculateFinalAmount(order) {
  // סנן רק פריטים שהוזמנו (לא בוטלו)
  const orderedItems = order.items.filter(item => {
    const isCancelled = item.status === 'cancelled' ||
                       item.itemStatus === 'cancelled' ||
                       item.cancellation?.cancelled === true;
    const isOrdered = item.status === 'ordered' ||
                     item.itemStatus === 'ordered' ||
                     item.itemStatus === 'ordered_from_supplier';
    return !isCancelled && isOrdered;
  });

  // אם אין פריטים פעילים - החזר 0
  if (orderedItems.length === 0) {
    return 0;
  }

  // סכום מוצרים
  const subtotal = orderedItems.reduce((sum, item) =>
    sum + ((item.price || 0) * (item.quantity || 1)), 0
  );

  // משלוח - רק אם יש פריטים פעילים
  const shipping = order.pricing?.shipping || 49;

  return Math.round((subtotal + shipping) * 100) / 100; // 2 ספרות אחרי הנקודה
}

/**
 * בדיקה האם הזמנה מוכנה לגביה
 * כל הפריטים צריכים להיות ב-status 'ordered' או 'cancelled'
 *
 * @param {Object} order - הזמנה
 * @returns {Boolean}
 */
export function isReadyToCharge(order) {
  if (!order.items || order.items.length === 0) {
    return false;
  }

  // בדוק שכל פריט הוכרע
  const allDecided = order.items.every(item => {
    return item.status === 'ordered' ||
           item.status === 'cancelled' ||
           item.itemStatus === 'ordered' ||
           item.itemStatus === 'cancelled';
  });

  // בדוק שיש לפחות פריט אחד שהוזמן
  const hasOrderedItems = order.items.some(item => {
    return item.status === 'ordered' || item.itemStatus === 'ordered';
  });

  return allDecided && hasOrderedItems;
}

export default {
  holdCredit,
  capturePayment,
  cancelTransaction,
  queryTransaction,
  isReadyToCharge
};
