/**
 * Cleanup Job - ניקוי הזמנות שפג תוקפן
 *
 * מטרה: למחוק הזמנות זמניות (awaiting_payment) שלא שולמו תוך 30 דקות
 *
 * רץ: כל 10 דקות (מוגדר ב-app.js)
 */

import Order from '../models/Order.js';

/**
 * ניקוי הזמנות שפג תוקפן
 * @returns {Promise<number>} מספר ההזמנות שנמחקו
 */
export async function cleanupExpiredOrders() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧹 [Cleanup] Starting expired orders cleanup...');

    const now = new Date();

    // מצא הזמנות awaiting_payment שפג תוקפן
    const query = {
      status: 'awaiting_payment',           // סטטוס זמני
      expiresAt: { $ne: null, $lt: now },   // פג תוקף
      'payment.status': 'pending',          // לא שולם
      'payment.hypTransactionId': null      // אין transaction ID
    };

    const expiredOrders = await Order.find(query)
      .select('orderNumber createdAt expiresAt user')
      .lean();

    if (expiredOrders.length === 0) {
      console.log('✅ [Cleanup] No expired orders found');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return 0;
    }

    console.log(`🗑️  [Cleanup] Found ${expiredOrders.length} expired order(s):`);
    expiredOrders.forEach((order, index) => {
      const createdAgo = Math.round((now - new Date(order.createdAt)) / 1000 / 60);
      console.log(`   ${index + 1}. ${order.orderNumber}`);
      console.log(`      Created: ${new Date(order.createdAt).toLocaleString('he-IL')} (${createdAgo} דקות לפני)`);
      console.log(`      Expired: ${new Date(order.expiresAt).toLocaleString('he-IL')}`);
      console.log(`      User: ${order.user}`);
    });

    // מחק הזמנות שפג תוקפן
    const result = await Order.deleteMany({
      _id: { $in: expiredOrders.map(o => o._id) }
    });

    console.log(`✅ [Cleanup] Successfully deleted ${result.deletedCount} expired order(s)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return result.deletedCount;
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ [Cleanup] Error during cleanup:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return 0;
  }
}

/**
 * ניקוי מיידי (לשימוש ידני)
 */
export async function cleanupExpiredOrdersNow() {
  console.log('🚀 [Cleanup] Manual cleanup triggered');
  return await cleanupExpiredOrders();
}
