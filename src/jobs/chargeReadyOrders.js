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
import { acquireLock, releaseLock } from '../utils/distributedLock.js';

/**
 * מבצע גביה להזמנה בודדת
 */
async function chargeOrder(order) {
  try {
    console.log('\n🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷');
    console.log('🤖 [ChargeJob] Processing order:', order.orderNumber);
    console.log('   Payment status:', order.payment.status);
    console.log('   Transaction ID:', order.payment.hypTransactionId);
    console.log('   Hold amount: ₪' + order.payment.holdAmount);
    console.log('🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷\n');

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

      // ✅ Phase 6.5.2: בדוק אם זה retry או נכשל סופית
      if (result.willRetry) {
        console.log(`[ChargeJob] ⏳ הזמנה ${order.orderNumber} תנסה שוב ב-${result.retryAt.toLocaleString('he-IL')}`);

        // סטטוס כבר עודכן ל-retry_pending ב-paymentService
        // רק צריך לעדכן timeline
        order.timeline.push({
          status: 'payment_retry_scheduled',
          message: `ניסיון ${result.retryCount}/${result.maxRetries} נכשל. ינסה שוב בקרוב`,
          timestamp: new Date()
        });

        await order.save();

        return { success: false, willRetry: true, retryAt: result.retryAt };

      } else {
        // נכשל סופית
        console.error(`[ChargeJob] ❌ גביה נכשלה סופית להזמנה ${order.orderNumber}: ${result.error}`);

        order.payment.status = 'failed';
        order.payment.lastError = result.error;
        order.payment.lastErrorCode = result.code;
        order.payment.lastErrorAt = new Date();

        order.timeline.push({
          status: 'payment_failed',
          message: `גביה נכשלה סופית: ${result.error}`,
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
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  🤖 CHARGE JOB STARTED                ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('⏰ Time:', new Date().toLocaleString('he-IL'));
  console.log('[ChargeJob] 🔍 Searching for ready orders...\n');

  try {
    // ✅ Phase 6.5.2: מצא גם הזמנות עם retry_pending שהגיע זמנן
    const readyOrders = await Order.find({
      $or: [
        { 'payment.status': 'ready_to_charge' },
        {
          'payment.status': 'retry_pending',
          'payment.nextRetryAt': { $lte: new Date() }
        }
      ],
      'payment.hypTransactionId': { $exists: true, $ne: null }
    })
    .sort({ 'payment.holdAt': 1 }) // הישנות ביותר קודם
    .limit(10); // גבול של 10 בכל הרצה

    if (readyOrders.length === 0) {
      console.log('[ChargeJob] ℹ️  No orders ready for charging');
      console.log('╚════════════════════════════════════════╝\n');
      return { processed: 0, success: 0, failed: 0 };
    }

    console.log(`[ChargeJob] 📋 Found ${readyOrders.length} orders ready for charging:`);
    readyOrders.forEach((order, i) => {
      console.log(`   ${i+1}. ${order.orderNumber} - ${order.payment.status} - ₪${order.payment.holdAmount}`);
    });
    console.log('');

    // סטטיסטיקות
    const stats = {
      processed: readyOrders.length,
      success: 0,
      failed: 0,
      cancelled: 0,
      skipped: 0 // ✅ Phase 6.5.3: locked by another instance
    };

    // ✅ Phase 6.5.3: גבה כל הזמנה עם distributed lock
    for (const order of readyOrders) {
      const lockKey = `charge_order_${order._id}`;

      // נסה לרכוש lock (60 שניות TTL)
      const acquired = await acquireLock(lockKey, 60);

      if (!acquired) {
        console.log(`[ChargeJob] ⏭️  Order ${order.orderNumber} locked by another instance, skipping`);
        stats.skipped++;
        continue;
      }

      // הצלחנו לרכוש lock - עכשיו נבצע גביה
      try {
        console.log(`[ChargeJob] 🔒 Acquired lock for order ${order.orderNumber}`);

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

      } catch (error) {
        console.error(`[ChargeJob] ❌ Error processing order ${order.orderNumber}:`, error);
        stats.failed++;
      } finally {
        // שחרר lock תמיד - גם אם הי תה שגיאה
        await releaseLock(lockKey);
        console.log(`[ChargeJob] 🔓 Released lock for order ${order.orderNumber}`);
      }

      // המתן 2 שניות בין בקשות (למנוע עומס על Hyp Pay)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  📊 CHARGE JOB SUMMARY                ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('✅ Success:', stats.success);
    console.log('🚫 Cancelled:', stats.cancelled);
    console.log('❌ Failed:', stats.failed);
    console.log('⏭️  Skipped (locked):', stats.skipped);
    console.log('📈 Total processed:', stats.processed);
    console.log('╚════════════════════════════════════════╝\n');

    return stats;

  } catch (error) {
    console.error('\n❌❌❌ [ChargeJob] CRITICAL ERROR ❌❌❌');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error('╚════════════════════════════════════════╝\n');
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
