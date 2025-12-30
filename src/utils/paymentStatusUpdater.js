/**
 * Payment Status Updater - Atomic Operations
 *
 * פתרון ל-Race Condition בעדכון payment.status
 *
 * הבעיה:
 * כאשר 2 אדמינים מעדכנים פריטים שונים במקביל:
 * 1. Admin A: מוסיף tracking לפריט 1 → order.save() → pre-save hook בודק תנאים
 * 2. Admin B: מוסיף tracking לפריט 2 → order.save() → pre-save hook בודק תנאים
 * 3. שני ה-hooks רואים payment.status = 'hold' ושניהם מעדכנים ל-'ready_to_charge'
 *
 * הפתרון:
 * Atomic findOneAndUpdate עם תנאי שמבטיח שרק instance אחד יכול לעדכן
 */

import Order from '../models/Order.js';

/**
 * עדכון אטומי של payment.status ל-'ready_to_charge'
 * מונע race condition בין אדמינים מרובים
 *
 * @param {string} orderId - מזהה ההזמנה
 * @returns {Object|null} ההזמנה המעודכנת או null אם לא התקיימו התנאים
 */
export async function markPaymentAsReady(orderId) {
  try {
    // Atomic operation - רק instance אחד יצליח
    const updated = await Order.findOneAndUpdate(
      {
        _id: orderId,
        'payment.status': 'hold', // רק אם עדיין hold
      },
      {
        $set: {
          'payment.status': 'ready_to_charge',
          'payment.readyAt': new Date()
        },
        $inc: { __v: 1 }, // Optimistic locking
        $push: {
          timeline: {
            status: 'ready_to_charge',
            message: 'כל הפריטים הוכרעו - מוכן לגביה (atomic update)',
            timestamp: new Date()
          }
        }
      },
      {
        new: true,
        runValidators: false // לא להריץ validators כי זה רק עדכון פנימי
      }
    );

    if (updated) {
      console.log(`[PaymentStatusUpdater] ✅ Order ${updated.orderNumber} marked as ready_to_charge (atomic)`);
      return updated;
    } else {
      console.log(`[PaymentStatusUpdater] ℹ️ Order ${orderId} was not updated (already processed or not in hold status)`);
      return null;
    }

  } catch (error) {
    console.error(`[PaymentStatusUpdater] ❌ Error updating order ${orderId}:`, error.message);
    throw error;
  }
}

/**
 * בדיקה האם הזמנה מוכנה לגביה (כל הפריטים הוכרעו)
 *
 * @param {Object} order - אובייקט ההזמנה
 * @returns {boolean} true אם כל הפריטים הוכרעו
 */
export function areAllItemsDecided(order) {
  return order.items.every(item => {
    const status = item.itemStatus;
    const isCancelled = item.cancellation?.cancelled === true;

    // פריט הוכרע אם: הוזמן מספק, או בוטל
    return status === 'ordered' || isCancelled;
  });
}

/**
 * ניסיון לעדכן payment status ל-ready_to_charge אם כל התנאים מתקיימים
 *
 * פונקציה זו בודקת תחילה את התנאים ורק אז מנסה לעדכן באופן אטומי
 *
 * @param {string} orderId - מזהה ההזמנה
 * @returns {Object} { updated: boolean, order: Object|null, reason: string }
 */
export async function tryMarkPaymentAsReady(orderId) {
  try {
    // קרא את ההזמנה
    const order = await Order.findById(orderId);

    if (!order) {
      return { updated: false, order: null, reason: 'Order not found' };
    }

    // בדוק תנאים
    if (order.payment.status !== 'hold') {
      return { updated: false, order, reason: `Payment status is ${order.payment.status}, not hold` };
    }

    if (!areAllItemsDecided(order)) {
      return { updated: false, order, reason: 'Not all items are decided yet' };
    }

    // נסה לעדכן באופן אטומי
    const updatedOrder = await markPaymentAsReady(orderId);

    if (updatedOrder) {
      return { updated: true, order: updatedOrder, reason: 'Successfully marked as ready_to_charge' };
    } else {
      return { updated: false, order, reason: 'Another process already updated the status' };
    }

  } catch (error) {
    console.error(`[tryMarkPaymentAsReady] Error:`, error);
    throw error;
  }
}
