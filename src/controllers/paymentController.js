/**
 * Payment Controller
 *
 * מטפל בכל הפעולות הקשורות לתשלומים:
 * - תפיסת מסגרת (hold)
 * - גביה (capture)
 * - ביטול (cancel)
 * - שאילתת סטטוס
 */

import Order from '../models/Order.js';
import { holdCredit, capturePayment, cancelTransaction, queryTransaction } from '../services/paymentService.js';
import { chargeReadyOrdersManual } from '../jobs/chargeReadyOrders.js';

/**
 * POST /api/payments/hold
 * תפיסת מסגרת אשראי עבור הזמנה
 */
export const holdPayment = async (req, res) => {
  try {
    const { orderId, paymentDetails } = req.body;

    // ולידציה
    if (!orderId || !paymentDetails) {
      return res.status(400).json({
        success: false,
        message: 'חסרים פרמטרים נדרשים'
      });
    }

    // מצא הזמנה
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    // בדוק שטרם נעשה hold
    if (order.payment?.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `לא ניתן לבצע hold - סטטוס נוכחי: ${order.payment?.status}`
      });
    }

    // בצע hold
    const result = await holdCredit(order, paymentDetails);

    if (result.success) {
      // עדכן הזמנה
      order.payment.status = 'hold';
      order.payment.hypTransactionId = result.transactionId;
      order.payment.holdAmount = result.amount;
      order.payment.holdAt = new Date();

      // הוסף להיסטוריה
      if (!order.payment.paymentHistory) {
        order.payment.paymentHistory = [];
      }
      order.payment.paymentHistory.push({
        action: 'hold',
        amount: result.amount,
        transactionId: result.transactionId,
        success: true,
        timestamp: new Date()
      });

      // הוסף לטיימליין
      order.timeline.push({
        status: 'payment_hold',
        message: `מסגרת אשראי נתפסה: ₪${result.amount}`,
        timestamp: new Date()
      });

      await order.save();

      return res.json({
        success: true,
        message: result.message,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          transactionId: result.transactionId,
          amount: result.amount
        }
      });
    } else {
      // hold נכשל
      order.payment.lastError = result.error;
      order.payment.lastErrorCode = result.code;
      order.payment.lastErrorAt = new Date();
      await order.save();

      return res.status(400).json({
        success: false,
        message: result.error,
        code: result.code
      });
    }

  } catch (error) {
    console.error('[PaymentController] holdPayment error:', error);
    return res.status(500).json({
      success: false,
      message: 'שגיאה בתפיסת מסגרת אשראי',
      error: error.message
    });
  }
};

/**
 * POST /api/payments/capture/:orderId
 * גביה ידנית (מנהל)
 */
export const capturePaymentManual = async (req, res) => {
  try {
    const { orderId } = req.params;

    // מצא הזמנה
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    // בדוק סטטוס
    if (!['hold', 'ready_to_charge'].includes(order.payment?.status)) {
      return res.status(400).json({
        success: false,
        message: `לא ניתן לגבות - סטטוס נוכחי: ${order.payment?.status}`
      });
    }

    // בצע גביה
    const result = await capturePayment(order);

    if (result.success) {
      // עדכן הזמנה
      order.payment.status = result.cancelled ? 'cancelled' : 'charged';
      order.payment.chargedAmount = result.chargedAmount || 0;
      order.payment.chargedAt = new Date();

      // הוסף להיסטוריה
      if (!order.payment.paymentHistory) {
        order.payment.paymentHistory = [];
      }
      order.payment.paymentHistory.push({
        action: result.cancelled ? 'cancel' : 'charge',
        amount: result.chargedAmount || 0,
        transactionId: result.transactionId || order.payment.hypTransactionId,
        success: true,
        timestamp: new Date()
      });

      // הוסף לטיימליין
      order.timeline.push({
        status: result.cancelled ? 'cancelled' : 'charged',
        message: result.message,
        timestamp: new Date()
      });

      await order.save();

      return res.json({
        success: true,
        message: result.message,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          chargedAmount: result.chargedAmount,
          cancelled: result.cancelled || false
        }
      });
    } else {
      // גביה נכשלה
      order.payment.status = 'failed';
      order.payment.lastError = result.error;
      order.payment.lastErrorCode = result.code;
      order.payment.lastErrorAt = new Date();
      await order.save();

      return res.status(400).json({
        success: false,
        message: result.error,
        code: result.code
      });
    }

  } catch (error) {
    console.error('[PaymentController] capturePaymentManual error:', error);
    return res.status(500).json({
      success: false,
      message: 'שגיאה בגביית תשלום',
      error: error.message
    });
  }
};

/**
 * POST /api/payments/cancel/:orderId
 * ביטול עסקה (מנהל)
 */
export const cancelPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    // מצא הזמנה
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    // בדוק סטטוס
    if (!['hold', 'ready_to_charge'].includes(order.payment?.status)) {
      return res.status(400).json({
        success: false,
        message: `לא ניתן לבטל - סטטוס נוכחי: ${order.payment?.status}`
      });
    }

    // בדוק שיש transactionId
    if (!order.payment?.hypTransactionId) {
      return res.status(400).json({
        success: false,
        message: 'אין מזהה עסקה'
      });
    }

    // בצע ביטול
    const result = await cancelTransaction(order.payment.hypTransactionId);

    if (result.success) {
      // עדכן הזמנה
      order.payment.status = 'cancelled';
      order.payment.cancelledAt = new Date();

      // הוסף להיסטוריה
      if (!order.payment.paymentHistory) {
        order.payment.paymentHistory = [];
      }
      order.payment.paymentHistory.push({
        action: 'cancel',
        amount: 0,
        transactionId: order.payment.hypTransactionId,
        success: true,
        timestamp: new Date()
      });

      // הוסף לטיימליין
      order.timeline.push({
        status: 'payment_cancelled',
        message: result.message,
        timestamp: new Date()
      });

      await order.save();

      return res.json({
        success: true,
        message: result.message,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.error,
        code: result.code
      });
    }

  } catch (error) {
    console.error('[PaymentController] cancelPayment error:', error);
    return res.status(500).json({
      success: false,
      message: 'שגיאה בביטול עסקה',
      error: error.message
    });
  }
};

/**
 * GET /api/payments/status/:orderId
 * שאילתת סטטוס תשלום
 */
export const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    // מצא הזמנה
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    // אם יש transactionId - שלוף סטטוס מ-Hyp Pay
    let hypStatus = null;
    if (order.payment?.hypTransactionId) {
      try {
        hypStatus = await queryTransaction(order.payment.hypTransactionId);
      } catch (error) {
        console.error('[PaymentController] queryTransaction error:', error);
        // המשך בלי הסטטוס מ-Hyp
      }
    }

    return res.json({
      success: true,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        payment: {
          status: order.payment?.status,
          method: order.payment?.method,
          holdAmount: order.payment?.holdAmount,
          chargedAmount: order.payment?.chargedAmount,
          holdAt: order.payment?.holdAt,
          chargedAt: order.payment?.chargedAt,
          cancelledAt: order.payment?.cancelledAt,
          lastError: order.payment?.lastError,
          hypTransactionId: order.payment?.hypTransactionId
        },
        hypStatus,
        history: order.payment?.paymentHistory || []
      }
    });

  } catch (error) {
    console.error('[PaymentController] getPaymentStatus error:', error);
    return res.status(500).json({
      success: false,
      message: 'שגיאה בשאילתת סטטוס',
      error: error.message
    });
  }
};

/**
 * POST /api/payments/charge-ready (Admin only)
 * הרצה ידנית של Job לגביה
 */
export const triggerChargeJob = async (req, res) => {
  try {
    console.log('[PaymentController] הרצה ידנית של chargeReadyOrders...');

    const stats = await chargeReadyOrdersManual();

    return res.json({
      success: true,
      message: 'Job הורץ בהצלחה',
      stats
    });

  } catch (error) {
    console.error('[PaymentController] triggerChargeJob error:', error);
    return res.status(500).json({
      success: false,
      message: 'שגיאה בהרצת Job',
      error: error.message
    });
  }
};

export default {
  holdPayment,
  capturePaymentManual,
  cancelPayment,
  getPaymentStatus,
  triggerChargeJob
};
