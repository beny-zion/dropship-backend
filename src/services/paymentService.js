/**
 * Payment Service - אינטגרציה עם Hyp Pay
 *
 * ✅ תזרים תשלום IFRAME (מומלץ - ללא PCI Compliance):
 * 1. generatePaymentUrl() - יצירת URL לדף תשלום של HyPay
 * 2. processCallback() - עיבוד callback מ-HyPay אחרי תשלום
 * 3. capturePayment() - גביה בפועל (Commit + Partial Capture)
 * 4. cancelTransaction() - ביטול מסגרת
 *
 * ❌ תזרים תשלום ישן (DEPRECATED - דורש PCI Compliance):
 * 1. holdCredit() - תפיסת מסגרת עם פרטי כרטיס
 *
 * מצבי תשלום:
 * - pending: ממתין לתשלום
 * - hold: מסגרת נתפסה (J5 Hold)
 * - ready_to_charge: מוכן לגביה (כל פריט הוכרע)
 * - charged: נגבה בהצלחה
 * - cancelled: בוטל
 */

import { sendRequest, isSuccessCode, getErrorMessage, validateCardDetails } from '../utils/hypPayClient.js';

// ============================================================
// ✅ IFRAME Payment Flow (New & Recommended)
// ============================================================

/**
 * Configuration for IFRAME payments
 */
const IFRAME_CONFIG = {
  SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000',
  // ✅ Auto-detect backend URL in production (Render.com sets RENDER_EXTERNAL_URL)
  BACKEND_URL: process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000',
};

// Callback URLs - Backend endpoints (HyPay sends callbacks here)
const CALLBACK_URLS = {
  SUCCESS: `${IFRAME_CONFIG.BACKEND_URL}/api/payments/callback/success`,
  ERROR: `${IFRAME_CONFIG.BACKEND_URL}/api/payments/callback/error`,
  NOTIFY: `${IFRAME_CONFIG.BACKEND_URL}/api/payments/callback/notify`,
};

/**
 * ✅ NEW: יצירת URL לדף תשלום של HyPay (IFRAME)
 *
 * @param {Object} order - הזמנה (populated)
 * @returns {Object} { success, paymentUrl, orderId, orderNumber, error }
 */
export function generatePaymentUrl(order) {
  try {
    const config = getConfig();

    // בניית פרמטרים
    const params = {
      // פעולה
      action: 'pay',

      // פרטי מסוף
      Masof: config.HYP_MASOF,
      PassP: config.HYP_PASSP,

      // סכום - HyPay מצפה לשקלים (לא אגורות!)
      Amount: String(Math.round(order.pricing.total)),

      // מזהה הזמנה
      Order: order.orderNumber,
      Info: `הזמנה ${order.orderNumber}`,

      // מטבע (1 = שקלים)
      Coin: '1',

      // J5 - שיריון מסגרת (מחזיר CCode=700)
      J5: 'True',

      // פרטי לקוח (אופציונלי - ממלא מראש)
      ClientName: order.shippingAddress?.fullName?.split(' ')[0] || '',
      ClientLName: order.shippingAddress?.fullName?.split(' ').slice(1).join(' ') || '',
      email: order.shippingAddress?.email || order.user?.email || '',
      cell: order.shippingAddress?.phone || '',  // טלפון נייד
      street: order.shippingAddress?.street || '',  // כתובת רחוב
      city: order.shippingAddress?.city || '',
      zip: order.shippingAddress?.zipCode || '',

      // Callbacks
      SuccessURL: CALLBACK_URLS.SUCCESS,
      ErrorURL: CALLBACK_URLS.ERROR,
      // NotifyURL: CALLBACK_URLS.NOTIFY,  // אופציונלי

      // הגדרות תצוגה
      UTF8: 'True',
      UTF8out: 'True',
      MoreData: 'True',  // מחזיר UID ו-ACode (חובה ל-J5)

      // 🔐 SECURITY: בקש signature לאימות Callback
      Sign: 'True',  // מחזיר Sign parameter ב-callback לאימות

      // אל תשלח UserId - נשאיר ריק

      // מזהה פנימי
      Tash: '1',
    };

    // בנה URL
    const queryString = new URLSearchParams(params).toString();
    const paymentUrl = `${config.HYP_API_URL}?${queryString}`;

    console.log('[PaymentService] Generated payment URL for order:', order.orderNumber);
    console.log('[PaymentService] Amount sent to HyPay:', params.Amount, 'shekels');
    console.log('[PaymentService] Cell (phone):', params.cell);
    console.log('[PaymentService] Street:', params.street);
    console.log('[PaymentService] City:', params.city);
    console.log('[PaymentService] Zip:', params.zip);
    console.log('[PaymentService] Full payment URL:', paymentUrl);

    return {
      success: true,
      paymentUrl,
      orderId: order._id.toString(),
      orderNumber: order.orderNumber
    };

  } catch (error) {
    console.error('[PaymentService] generatePaymentUrl error:', error);
    return {
      success: false,
      error: 'שגיאה ביצירת קישור תשלום'
    };
  }
}

/**
 * ✅ NEW: עיבוד Callback מ-HyPay (אחרי תשלום)
 *
 * @param {Object} callbackData - נתונים שהתקבלו מ-HyPay (query params)
 * @returns {Object} { success, transactionId, authCode, uid, amount, orderNumber, orderId, error }
 */
export function processCallback(callbackData) {
  try {
    // ✅ Phase 6.5.4: רק מזהים, לא נתונים רגישים
    console.log('[PaymentService] Processing callback - Order:', callbackData.Order, 'CCode:', callbackData.CCode);

    const ccode = String(callbackData.CCode || callbackData.ccode || '');

    // בדוק הצלחה
    if (!isSuccessCode(ccode, 'soft')) {
      return {
        success: false,
        error: getErrorMessage(callbackData),
        code: ccode
      };
    }

    // חלץ נתונים
    const result = {
      success: true,
      transactionId: callbackData.Id || callbackData.TransId,
      authCode: callbackData.ACode || callbackData.AuthNum,
      uid: callbackData.UID,  // UID שחוזר מ-HyPay
      userId: callbackData.UserId,  // ת.ז. שהמשתמש מילא
      amount: parseFloat(callbackData.Amount), // HyPay מחזיר בשקלים (לא אגורות!)
      orderNumber: callbackData.Order,  // נשתמש בזה למצוא את ההזמנה
      ccode,
      isHold: ccode === '700',
      message: ccode === '700' ? 'מסגרת אשראי נתפסה (J5)' : 'עסקה הצליחה',
      raw: callbackData
    };

    console.log('[PaymentService] Callback processed successfully:', {
      transactionId: result.transactionId,
      authCode: result.authCode,
      uid: result.uid,
      amount: result.amount,
      ccode,
      isHold: result.isHold,
      message: result.message
    });

    return result;

  } catch (error) {
    console.error('[PaymentService] processCallback error:', error);
    return {
      success: false,
      error: 'שגיאה בעיבוד תשובה מ-HyPay'
    };
  }
}

/**
 * Helper function to get config (used by generatePaymentUrl)
 */
function getConfig() {
  return {
    HYP_API_URL: process.env.HYP_API_URL || 'https://pay.hyp.co.il/p/',
    HYP_MASOF: process.env.HYP_MASOF,
    HYP_PASSP: process.env.HYP_PASSP,
    HYP_TEST_MODE: process.env.HYP_TEST_MODE === 'true'
  };
}

// ============================================================
// ❌ Old Payment Flow (DEPRECATED)
// ============================================================

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
    J5: 'True',        // ✅ שיריון מסגרת - מחזיר CCode=700
    MoreData: 'True',  // ✅ מחזיר UID, ACode (חובה ל-J5)
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

    console.log('💳 [HoldCredit] HyPay Response:', {
      CCode: result.CCode,
      Id: result.Id,
      ACode: result.ACode,
      UID: result.UID,
      Amount: result.Amount
    });

    // CCode=700 = שיריון מסגרת (J5)
    // תשובת J5 כוללת: Id, ACode, UID (כשמוסיפים MoreData=True)
    if (isSuccessCode(result.CCode, 'soft')) {
      console.log('✅ [HoldCredit] Success! CCode:', result.CCode, '(Expected: 700 for J5)');

      return {
        success: true,
        transactionId: result.Id,
        authCode: result.ACode,
        uid: result.UID,  // שים לב: UID ולא UserId!
        amount: order.pricing.total,
        message: `מסגרת אשראי נתפסה בהצלחה (J5 - CCode ${result.CCode})`,
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
 * יצירת טוקן מעסקה קיימת (getToken)
 * נחוץ כדי לבצע Partial Capture על עסקת J5
 *
 * @param {String} transactionId - מזהה העסקה המקורית (Id מה-J5)
 * @returns {Promise<Object>} { success, token, tokef, error }
 */
export async function createTokenFromTransaction(transactionId) {
  console.log(`🎫 [CreateToken] Creating token from transaction: ${transactionId}`);

  const params = {
    action: 'getToken',
    TransId: transactionId
  };

  try {
    const result = await sendRequest(params);

    console.log('🎫 [CreateToken] HyPay Response:', {
      CCode: result.CCode,
      Token: result.Token ? `****${result.Token.slice(-4)}` : undefined,
      Tokef: result.Tokef
    });

    if (isSuccessCode(result.CCode, 'getToken')) {
      console.log('✅ [CreateToken] Token created successfully!');

      return {
        success: true,
        token: result.Token,      // טוקן 19 ספרות
        tokef: result.Tokef,      // תוקף בפורמט YYMM
        raw: result
      };
    }

    return {
      success: false,
      error: getErrorMessage(result),
      code: result.CCode
    };

  } catch (error) {
    console.error('[CreateToken] error:', error);
    return {
      success: false,
      error: 'תקלה ביצירת טוקן',
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

  // ✅ Phase 6.5.3: J5 Token-Based Partial Capture
  // אם יש טוקן - תמיד השתמש בו (לפי test-j5.js)
  const hasToken = order.payment.hypToken && order.payment.hypTokenExpiry;
  const hasJ5Data = order.payment.hypAuthCode && order.payment.hypUid;

  let params;

  if (hasToken && hasJ5Data) {
    // 🎫 J5 Token-Based Partial Capture - השיטה המומלצת!
    console.log(`[PaymentService] 💰 J5 Token Capture: ₪${finalAmount}`);
    console.log(`   Token: ****${order.payment.hypToken.slice(-4)}`);
    console.log(`   Original UID: ${order.payment.hypUid}`);
    console.log(`   Original Amount: ₪${order.payment.holdAmount || finalAmount}`);

    // פירוק התוקף (Tokef) בפורמט YYMM
    const tokef = order.payment.hypTokenExpiry; // YYMM format
    const tYear = tokef.substring(0, 2);  // YY
    const tMonth = tokef.substring(2, 4); // MM

    // סכום באגורות לפרמטר originalAmount (x100)
    const originalAmountAgorot = Math.round((order.payment.holdAmount || finalAmount) * 100);

    params = {
      action: 'soft',
      Amount: Math.round(finalAmount * 100) / 100,  // סכום בשקלים

      // 🎫 נתוני הטוקן
      CC: order.payment.hypToken,
      Tmonth: tMonth,
      Tyear: tYear,
      Token: 'True',

      // 🔗 פרמטרי J5 Partial Capture (קישור לעסקה המקורית)
      'inputObj.originalUid': order.payment.hypUid,
      'inputObj.originalAmount': originalAmountAgorot.toString(),  // באגורות!
      'AuthNum': order.payment.hypAuthCode,
      'inputObj.authorizationCodeManpik': '7',  // קבוע של SHVA

      // נתונים נוספים
      Coin: '1',
      Order: order.orderNumber,
      Info: `הזמנה ${order.orderNumber} - גביה סופית`,
      ClientName: order.customer?.firstName || 'Customer',
      ClientLName: order.customer?.lastName || 'Name',
      UserId: order.customer?.phone || '000000000'
    };
  } else if (hasJ5Data) {
    // ⚠️ Fallback: J5 Partial Capture ללא טוקן (לא אמור לקרות)
    console.log(`[PaymentService] ⚠️ J5 Partial Capture without token (fallback)`);
    console.log(`   Missing token - this should not happen!`);

    const originalAmountAgorot = Math.round((order.payment.holdAmount || finalAmount) * 100);

    params = {
      action: 'soft',
      Amount: Math.round(finalAmount * 100) / 100,
      'inputObj.originalUid': order.payment.hypUid,
      'inputObj.originalAmount': originalAmountAgorot.toString(),
      'AuthNum': order.payment.hypAuthCode,
      'inputObj.authorizationCodeManpik': '7',
      Order: order.orderNumber,
      Info: `גביה חלקית - הזמנה ${order.orderNumber}`
    };
  } else {
    // ⚠️ Fallback: commitTrans רגיל (למקרים ישנים/תקלות)
    console.log(`[PaymentService] ⚠️ Full Capture with commitTrans (legacy fallback)`);
    console.log(`   Missing J5 data - using regular commitTrans`);

    params = {
      action: 'commitTrans',
      TransId: order.payment.hypTransactionId
    };
  }

  try {
    const result = await sendRequest(params);

    // קביעת שיטת הגביה לצורך לוגים
    const captureMethod = hasToken && hasJ5Data
      ? 'J5 Token Capture'
      : hasJ5Data
        ? 'J5 Partial Capture (no token)'
        : 'commitTrans (legacy)';

    console.log('💰 [CapturePayment] HyPay Response:', {
      action: params.action,
      CCode: result.CCode,
      Id: result.Id,
      method: captureMethod,
      usedToken: hasToken,
      finalAmount
    });

    // ✅ הצלחה!
    const action = params.action === 'soft' ? 'soft' : 'commitTrans';
    if (isSuccessCode(result.CCode, action)) {
      console.log('✅ [CapturePayment] Charge successful!', {
        CCode: result.CCode,
        method: captureMethod,
        amount: finalAmount,
        expectedCCode: action === 'soft' ? '0 or 700' : '0 or 250'
      });

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
  // ✅ FIX: שימוש ב-?? במקום || כי 0 (משלוח חינם) הוא falsy
  const shipping = order.pricing?.shipping ?? 49;

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
  // ✅ IFRAME Flow (New)
  generatePaymentUrl,
  processCallback,

  // Shared functions
  capturePayment,
  cancelTransaction,
  queryTransaction,
  isReadyToCharge,

  // ❌ DEPRECATED
  holdCredit
};
