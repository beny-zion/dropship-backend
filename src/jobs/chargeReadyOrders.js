/**
 * Job: Charge Ready Orders
 *
 * סורק הזמנות שמוכנות לגביה ומבצע גביה אוטומטית.
 *
 * תזרים:
 * 1. מחפש הזמנות עם payment.status = 'ready_to_charge'
 * 2. מוודא שיש hypTransactionId (hold פעיל)
 * 3. מבצע גביה דרך capturePayment()
 * 4. מעדכן את ההזמנה לפי התוצאה
 *
 * הרצה: כל 10 דקות
 */

import Order from '../models/Order.js';
import { capturePayment } from '../services/paymentService.js';

/**
 * מבצע גביה להזמנה בודדת
 */
async function chargeOrder(order) {
  try {
    console.log(`[ChargeJob] 🔄 מנסה לגבות הזמנה ${order.orderNumber}...`);

    // ולידציה - חייב להיות transactionId
    if (!order.payment?.hypTransactionId) {
      console.error(`[ChargeJob] ❌ הזמנה ${order.orderNumber} ללא hypTransactionId`);

      // עדכן לשגיאה
      order.payment.status = 'failed';
      order.payment.lastError = 'חסר מזהה עסקה';
      order.payment.lastErrorAt = new Date();
      await order.save();

      return { success: false, error: 'חסר מזהה עסקה' };
    }

    // בצע גביה
    const result = await capturePayment(order);

    if (result.success) {
      // ✅ גביה הצליחה
      console.log(`[ChargeJob] ✅ הזמנה ${order.orderNumber} נגבתה בהצלחה: ₪${result.chargedAmount}`);

      // עדכן הזמנה
      order.payment.status = 'charged';
      order.payment.chargedAmount = result.chargedAmount;
      order.payment.chargedAt = new Date();

      // הוסף לטיימליין
      order.timeline.push({
        status: 'charged',
        message: `תשלום נגבה: ₪${result.chargedAmount}`,
        timestamp: new Date()
      });

      // הוסף להיסטוריה
      if (!order.payment.paymentHistory) {
        order.payment.paymentHistory = [];
      }
      order.payment.paymentHistory.push({
        action: 'charge',
        amount: result.chargedAmount,
        transactionId: result.transactionId || order.payment.hypTransactionId,
        success: true,
        timestamp: new Date()
      });

      await order.save();

      return { success: true, chargedAmount: result.chargedAmount };

    } else if (result.cancelled) {
      // ✅ עסקה בוטלה (כל הפריטים בוטלו)
      console.log(`[ChargeJob] 🚫 הזמנה ${order.orderNumber} בוטלה (כל הפריטים בוטלו)`);

      order.payment.status = 'cancelled';
      order.payment.cancelledAt = new Date();

      order.timeline.push({
        status: 'cancelled',
        message: 'התשלום בוטל - כל הפריטים בוטלו',
        timestamp: new Date()
      });

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

      await order.save();

      return { success: true, cancelled: true };

    } else {
      // ❌ גביה נכשלה
      console.error(`[ChargeJob] ❌ גביה נכשלה להזמנה ${order.orderNumber}: ${result.error}`);

      order.payment.status = 'failed';
      order.payment.lastError = result.error;
      order.payment.lastErrorCode = result.code;
      order.payment.lastErrorAt = new Date();

      order.timeline.push({
        status: 'payment_failed',
        message: `גביה נכשלה: ${result.error}`,
        timestamp: new Date()
      });

      // הוסף להיסטוריה
      if (!order.payment.paymentHistory) {
        order.payment.paymentHistory = [];
      }
      order.payment.paymentHistory.push({
        action: 'charge',
        amount: 0,
        transactionId: order.payment.hypTransactionId,
        success: false,
        error: result.error,
        timestamp: new Date()
      });

      await order.save();

      return { success: false, error: result.error };
    }

  } catch (error) {
    console.error(`[ChargeJob] ❌ שגיאה בגביה להזמנה ${order.orderNumber}:`, error);

    // עדכן שגיאה
    order.payment.status = 'failed';
    order.payment.lastError = error.message;
    order.payment.lastErrorAt = new Date();
    await order.save();

    return { success: false, error: error.message };
  }
}

/**
 * פונקציה ראשית - סריקת וגביית הזמנות
 */
export async function chargeReadyOrders() {
  console.log('[ChargeJob] 🔍 מחפש הזמנות מוכנות לגביה...');

  try {
    // מצא הזמנות מוכנות לגביה
    const readyOrders = await Order.find({
      'payment.status': 'ready_to_charge',
      'payment.hypTransactionId': { $exists: true, $ne: null }
    })
    .sort({ 'payment.holdAt': 1 }) // הישנות ביותר קודם
    .limit(10); // גבול של 10 בכל הרצה

    if (readyOrders.length === 0) {
      console.log('[ChargeJob] ℹ️  אין הזמנות מוכנות לגביה');
      return { processed: 0, success: 0, failed: 0 };
    }

    console.log(`[ChargeJob] 📋 נמצאו ${readyOrders.length} הזמנות מוכנות לגביה`);

    // סטטיסטיקות
    const stats = {
      processed: readyOrders.length,
      success: 0,
      failed: 0,
      cancelled: 0
    };

    // גבה כל הזמנה
    for (const order of readyOrders) {
      const result = await chargeOrder(order);

      if (result.success) {
        if (result.cancelled) {
          stats.cancelled++;
        } else {
          stats.success++;
        }
      } else {
        stats.failed++;
      }

      // המתן 2 שניות בין בקשות (למנוע עומס על Hyp Pay)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('[ChargeJob] ✅ סיכום ריצה:', {
      processed: stats.processed,
      success: stats.success,
      cancelled: stats.cancelled,
      failed: stats.failed
    });

    return stats;

  } catch (error) {
    console.error('[ChargeJob] ❌ שגיאה בהרצת Job:', error);
    throw error;
  }
}

/**
 * פונקציה להרצה ידנית (לצורכי בדיקה)
 */
export async function chargeReadyOrdersManual() {
  console.log('[ChargeJob] 🚀 הרצה ידנית...');
  return await chargeReadyOrders();
}

export default {
  chargeReadyOrders,
  chargeReadyOrdersManual
};
