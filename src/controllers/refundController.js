/**
 * Refund Controller
 *
 * Phase 10: ניהול החזרים
 * מטפל בכל הבקשות API להחזרי כספים
 */

import {
  processRefund,
  getOrderRefunds,
  getAllRefunds,
  getRefundStats,
  canRefund,
  calculateRefundAmount,
  chargeWithNewCard
} from '../services/refundService.js';
import Order from '../models/Order.js';
import { sendRequest, isSuccessCode, getErrorMessage, getConfig } from '../utils/hypPayClient.js';

/**
 * ביצוע החזר כספי
 * POST /api/admin/refunds
 *
 * הלקוח מקריא פרטי כרטיס בטלפון והמנהל מזין אותם
 */
export const createRefund = async (req, res) => {
  try {
    const { orderId, itemIds, reason, customAmount, cardDetails } = req.body;

    // ולידציה
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'נדרש מזהה הזמנה'
      });
    }

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'נדרשת סיבה להחזר (לפחות 3 תווים)'
      });
    }

    // ולידציה של פרטי כרטיס
    if (!cardDetails) {
      return res.status(400).json({
        success: false,
        error: 'נדרשים פרטי כרטיס אשראי'
      });
    }

    const { cardNumber, expMonth, expYear, cvv, holderId } = cardDetails;

    if (!cardNumber || cardNumber.length < 13) {
      return res.status(400).json({
        success: false,
        error: 'מספר כרטיס לא תקין'
      });
    }

    if (!expMonth || !expYear) {
      return res.status(400).json({
        success: false,
        error: 'תוקף כרטיס לא תקין'
      });
    }

    if (!cvv || cvv.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'CVV לא תקין'
      });
    }

    if (!holderId || holderId.length < 5) {
      return res.status(400).json({
        success: false,
        error: 'ת.ז. בעל הכרטיס לא תקינה'
      });
    }

    // ביצוע ההחזר
    const result = await processRefund(
      orderId,
      itemIds || [],
      reason.trim(),
      req.user,
      customAmount,
      cardDetails
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        errorCode: result.errorCode
      });
    }

    res.json({
      success: true,
      message: `החזר בסך ₪${result.refund.amount} בוצע בהצלחה`,
      data: result.refund
    });

  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'שגיאה בביצוע ההחזר'
    });
  }
};

/**
 * קבלת כל ההחזרים (דשבורד אדמין)
 * GET /api/admin/refunds
 */
export const getRefunds = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      fromDate,
      toDate
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;

    const result = await getAllRefunds(
      filters,
      parseInt(page),
      parseInt(limit)
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Get refunds error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'שגיאה בטעינת ההחזרים'
    });
  }
};

/**
 * קבלת סטטיסטיקות החזרים
 * GET /api/admin/refunds/stats
 */
export const getStats = async (req, res) => {
  try {
    const stats = await getRefundStats();

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get refund stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'שגיאה בטעינת הסטטיסטיקות'
    });
  }
};

/**
 * קבלת החזרים של הזמנה ספציפית
 * GET /api/admin/orders/:orderId/refunds
 */
export const getOrderRefundsHandler = async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await getOrderRefunds(orderId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Get order refunds error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'שגיאה בטעינת החזרי ההזמנה'
    });
  }
};

/**
 * בדיקת יכולת החזר להזמנה
 * GET /api/admin/orders/:orderId/can-refund
 */
export const checkCanRefund = async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await canRefund(orderId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Check can refund error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'שגיאה בבדיקת יכולת החזר'
    });
  }
};

/**
 * חישוב סכום החזר (preview)
 * POST /api/admin/orders/:orderId/calculate-refund
 */
export const calculateRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { itemIds } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'הזמנה לא נמצאה'
      });
    }

    // אם לא נבחרו פריטים - חשב את כולם
    const itemsToCalculate = itemIds && itemIds.length > 0
      ? itemIds
      : order.items
          .filter(item => !item.cancellation?.cancelled)
          .map(item => item._id.toString());

    const calculation = calculateRefundAmount(order, itemsToCalculate);

    res.json({
      success: true,
      data: calculation
    });

  } catch (error) {
    console.error('Calculate refund error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'שגיאה בחישוב סכום ההחזר'
    });
  }
};

/**
 * גביה ידנית מיידית
 * POST /api/admin/orders/:orderId/manual-charge
 *
 * מאפשר למנהל לגבות סכום ספציפי מהזמנה קיימת
 * - במקרה של כשל בגביה אוטומטית
 * - לגביה נוספת או משלימה
 */
export const manualCharge = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount, reason, cardDetails } = req.body;

    // ולידציה
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'נדרש סכום גביה חיובי'
      });
    }

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'נדרשת סיבה לגביה (לפחות 3 תווים)'
      });
    }

    // מצא את ההזמנה
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'הזמנה לא נמצאה'
      });
    }

    // בדוק שיש נתוני תשלום או פרטי כרטיס חדש
    const hasExistingPayment = order.payment?.hypTransactionId || order.payment?.hypToken;
    const hasNewCard = cardDetails && cardDetails.cardNumber;

    if (!hasExistingPayment && !hasNewCard) {
      return res.status(400).json({
        success: false,
        error: 'נדרשים פרטי תשלום קיימים או פרטי כרטיס חדש'
      });
    }

    // ולידציה של פרטי כרטיס אם ניתנו
    if (hasNewCard) {
      if (!cardDetails.cardNumber || !cardDetails.expMonth || !cardDetails.expYear || !cardDetails.cvv || !cardDetails.holderId) {
        return res.status(400).json({
          success: false,
          error: 'פרטי כרטיס חסרים או לא תקינים'
        });
      }
    }

    // חישוב סכום מקסימלי לגביה
    const alreadyCharged = order.payment?.chargedAmount || 0;
    const originalAmount = order.payment?.holdAmount || order.pricing?.total || 0;
    const maxChargeable = originalAmount - alreadyCharged;

    if (amount > maxChargeable && maxChargeable > 0) {
      return res.status(400).json({
        success: false,
        error: `לא ניתן לגבות יותר מ-₪${maxChargeable.toFixed(2)} (סכום המסגרת המקורי)`
      });
    }

    const config = getConfig();

    // ✅ Mock Mode - דלג על Hyp Pay API
    if (config.HYP_MOCK_MODE) {
      console.log('🟡 MOCK MODE: Simulating Manual Charge');
      console.log('   Amount:', amount);
      console.log('   Reason:', reason);

      const mockTransactionId = `CHARGE-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // עדכון ההזמנה
      order.payment.chargedAmount = (alreadyCharged + amount);
      order.payment.status = order.payment.chargedAmount >= originalAmount ? 'charged' : 'partial_charge';
      order.payment.lastChargeAt = new Date();

      // הוסף להיסטוריה
      if (!order.payment.chargeHistory) {
        order.payment.chargeHistory = [];
      }
      order.payment.chargeHistory.push({
        amount,
        reason: reason.trim(),
        transactionId: mockTransactionId,
        processedBy: req.user?._id,
        processedAt: new Date(),
        method: 'manual',
        mock: true
      });

      await order.save();

      return res.json({
        success: true,
        message: `נגבה בהצלחה ₪${amount} (MOCK)`,
        data: {
          chargedAmount: amount,
          transactionId: mockTransactionId,
          totalCharged: order.payment.chargedAmount,
          paymentStatus: order.payment.status
        }
      });
    }

    // ביצוע גביה בפועל
    let result;
    let chargeMethod = 'unknown';

    // אם נתנו פרטי כרטיס חדש - השתמש בגביה מכרטיס חדש
    if (hasNewCard) {
      console.log(`[ManualCharge] Charging order ${order.orderNumber}: ₪${amount} with new card`);

      result = await chargeWithNewCard(cardDetails, amount, {
        orderNumber: order.orderNumber,
        reason: reason.trim(),
        customerName: cardDetails.customerName
      });

      chargeMethod = 'new_card';

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error || 'גביה נכשלה',
          errorCode: result.errorCode
        });
      }

      // המר את התוצאה לפורמט שההמשך מצפה לו
      result = {
        CCode: result.CCode,
        ACode: result.ACode,
        Id: result.transactionId,
        UID: result.UID,
        success: true
      };

    } else {
      // אם יש טוקן - נשתמש בו, אחרת נשתמש ב-commitTrans
      let params;
      const hasToken = order.payment.hypToken && order.payment.hypTokenExpiry;
      const hasJ5Data = order.payment.hypAuthCode && order.payment.hypUid;

      if (hasToken && hasJ5Data) {
        // J5 Token-Based Charge
        chargeMethod = 'token';
        const tokef = order.payment.hypTokenExpiry;
        const tYear = tokef.substring(0, 2);
        const tMonth = tokef.substring(2, 4);
        const originalAmountAgorot = Math.round((order.payment.holdAmount || originalAmount) * 100);

        params = {
          action: 'soft',
          Amount: Math.round(amount * 100) / 100,
          CC: order.payment.hypToken,
          Tmonth: tMonth,
          Tyear: tYear,
          Token: 'True',
          'inputObj.originalUid': order.payment.hypUid,
          'inputObj.originalAmount': originalAmountAgorot.toString(),
          'AuthNum': order.payment.hypAuthCode,
          'inputObj.authorizationCodeManpik': '7',
          Coin: '1',
          Order: order.orderNumber,
          Info: `גביה ידנית - הזמנה ${order.orderNumber}`
        };
      } else {
        // commitTrans עבור מסגרות ישנות
        chargeMethod = 'commitTrans';
        params = {
          action: 'commitTrans',
          TransId: order.payment.hypTransactionId,
          Amount: Math.round(amount * 100) / 100
        };
      }

      console.log(`[ManualCharge] Charging order ${order.orderNumber}: ₪${amount} via ${chargeMethod}`);

      result = await sendRequest(params);
    }

    const action = hasNewCard ? 'soft' : (result.action === 'soft' ? 'soft' : 'commitTrans');
    if (result.success || isSuccessCode(result.CCode, action)) {
      // עדכון ההזמנה
      order.payment.chargedAmount = (alreadyCharged + amount);
      order.payment.status = order.payment.chargedAmount >= originalAmount ? 'charged' : 'partial_charge';
      order.payment.lastChargeAt = new Date();

      // הוסף להיסטוריה
      if (!order.payment.chargeHistory) {
        order.payment.chargeHistory = [];
      }
      order.payment.chargeHistory.push({
        amount,
        reason: reason.trim(),
        transactionId: result.Id || order.payment.hypTransactionId,
        authCode: result.ACode,
        processedBy: req.user?._id,
        processedAt: new Date(),
        method: 'manual',
        chargeMethod,
        CCode: result.CCode
      });

      await order.save();

      console.log(`✅ [ManualCharge] Success: ₪${amount} charged for order ${order.orderNumber}`);

      return res.json({
        success: true,
        message: `נגבה בהצלחה ₪${amount}`,
        data: {
          chargedAmount: amount,
          transactionId: result.Id || order.payment.hypTransactionId,
          totalCharged: order.payment.chargedAmount,
          paymentStatus: order.payment.status
        }
      });
    }

    // שגיאה
    const errorMessage = getErrorMessage(result);
    console.error(`❌ [ManualCharge] Failed: ${errorMessage}`);

    return res.status(400).json({
      success: false,
      error: `גביה נכשלה: ${errorMessage}`,
      errorCode: result.CCode
    });

  } catch (error) {
    console.error('Manual charge error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'שגיאה בביצוע הגביה'
    });
  }
};

/**
 * בדיקת יכולת גביה להזמנה
 * GET /api/admin/orders/:orderId/can-charge
 */
export const checkCanCharge = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'הזמנה לא נמצאה'
      });
    }

    const hasPaymentData = !!(order.payment?.hypTransactionId || order.payment?.hypToken);
    const alreadyCharged = order.payment?.chargedAmount || 0;
    const originalAmount = order.payment?.holdAmount || order.pricing?.total || 0;
    const maxChargeable = Math.max(0, originalAmount - alreadyCharged);
    const paymentStatus = order.payment?.status || 'unknown';

    // ניתן לגבות רק אם יש מסגרת אשראי ועדיין לא נגבה הכל
    const canCharge = hasPaymentData &&
                      maxChargeable > 0 &&
                      !['charged', 'cancelled', 'refunded', 'full_refund'].includes(paymentStatus);

    res.json({
      success: true,
      data: {
        canCharge,
        maxChargeable,
        alreadyCharged,
        originalAmount,
        paymentStatus,
        hasToken: !!(order.payment?.hypToken),
        hasTransactionId: !!(order.payment?.hypTransactionId),
        reason: !canCharge ? (
          !hasPaymentData ? 'אין פרטי תשלום' :
          maxChargeable <= 0 ? 'כבר נגבה הסכום המלא' :
          'סטטוס תשלום לא מאפשר גביה'
        ) : null
      }
    });

  } catch (error) {
    console.error('Check can charge error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'שגיאה בבדיקת יכולת גביה'
    });
  }
};

export default {
  createRefund,
  getRefunds,
  getStats,
  getOrderRefundsHandler,
  checkCanRefund,
  calculateRefund,
  manualCharge,
  checkCanCharge
};
