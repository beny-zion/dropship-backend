/**
 * Order Calculations Utilities
 *
 * פונקציות עזר לחישובי הזמנות, החזרים, ומינימום
 */

import SystemSettings from '../models/SystemSettings.js';

// ✅ REMOVED HARDCODED CONSTANTS - Now using dynamic settings from SystemSettings model

/**
 * חישוב סכום פריטים פעילים (לא מבוטלים)
 */
export function calculateActiveItemsTotal(items) {
  if (!items || !Array.isArray(items)) {
    return 0;
  }

  return items
    .filter(item => !item.cancellation?.cancelled)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

/**
 * קבלת פריטים פעילים
 */
export function getActiveItems(items) {
  if (!items || !Array.isArray(items)) {
    return [];
  }

  return items.filter(item => !item.cancellation?.cancelled);
}

/**
 * חישוב סכום החזרים
 */
export function calculateTotalRefunds(items) {
  if (!items || !Array.isArray(items)) {
    return 0;
  }

  return items
    .filter(item => item.cancellation?.cancelled)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

/**
 * חישוב refund לפריט בודד
 */
export function calculateItemRefund(item) {
  if (!item) {
    return 0;
  }

  return item.price * item.quantity;
}

/**
 * חישוב adjustedTotal אחרי ביטולים
 */
export function calculateAdjustedTotal(order) {
  if (!order || !order.pricing) {
    return 0;
  }

  const totalRefunds = calculateTotalRefunds(order.items);
  return order.pricing.total - totalRefunds;
}

/**
 * בדיקה אם ההזמנה עומדת במינימום
 * ✅ NOW USES DYNAMIC SETTINGS
 */
export async function checkOrderMinimumRequirements(order) {
  const settings = await SystemSettings.getSettings();
  const minimumAmount = settings.order.minimumAmount.ils;
  const minimumCount = settings.order.minimumItemsCount;

  const activeItems = getActiveItems(order.items);
  const activeItemsCount = activeItems.length;
  const activeItemsTotal = calculateActiveItemsTotal(order.items);

  const meetsAmount = activeItemsTotal >= minimumAmount;
  const meetsCount = activeItemsCount >= minimumCount;
  const meetsMinimum = meetsAmount && meetsCount;

  return {
    meetsMinimum,
    meetsAmount,
    meetsCount,
    activeItemsCount,
    activeItemsTotal,
    minimumAmount,
    minimumCount,
    amountDifference: minimumAmount - activeItemsTotal,
    countDifference: minimumCount - activeItemsCount
  };
}

/**
 * עדכון pricing של הזמנה לאחר ביטול
 */
export function updateOrderPricing(order) {
  const totalRefunds = calculateTotalRefunds(order.items);
  const adjustedTotal = order.pricing.total - totalRefunds;

  return {
    ...order.pricing,
    totalRefunds,
    adjustedTotal
  };
}

/**
 * יצירת refund record
 */
export function createRefundRecord(item, reason, userId) {
  const refundAmount = calculateItemRefund(item);

  return {
    amount: refundAmount,
    reason: reason || `ביטול פריט - ${item.name}`,
    items: [item._id],
    processedAt: null,
    processedBy: null,
    status: 'pending',
    refundMethod: null,
    transactionId: null,
    createdAt: new Date()
  };
}

/**
 * בדיקה אם כל הפריטים בוטלו
 */
export function areAllItemsCancelled(items) {
  if (!items || items.length === 0) {
    return false;
  }

  return items.every(item => item.cancellation?.cancelled);
}

/**
 * בדיקה אם כל הפריטים נמסרו
 */
export function areAllItemsDelivered(items) {
  if (!items || items.length === 0) {
    return false;
  }

  const activeItems = getActiveItems(items);
  if (activeItems.length === 0) {
    return false;
  }

  return activeItems.every(item => item.itemStatus === 'delivered');
}

/**
 * קבלת סטטוס הזמנה כללי בהתאם לסטטוס הפריטים
 */
export function computeOrderStatusFromItems(items) {
  if (!items || items.length === 0) {
    return 'pending';
  }

  // אם כל הפריטים בוטלו
  if (areAllItemsCancelled(items)) {
    return 'cancelled';
  }

  // אם כל הפריטים (שלא בוטלו) נמסרו
  if (areAllItemsDelivered(items)) {
    return 'delivered';
  }

  const activeItems = getActiveItems(items);

  // בדוק את הסטטוס המתקדם ביותר
  const hasDelivered = activeItems.some(item => item.itemStatus === 'delivered');
  const hasReadyForDelivery = activeItems.some(item => item.itemStatus === 'ready_for_delivery');
  const hasArrivedIsrael = activeItems.some(item => item.itemStatus === 'arrived_israel');
  const hasShippedToIsrael = activeItems.some(item => item.itemStatus === 'shipped_to_israel');
  const hasArrivedUS = activeItems.some(item => item.itemStatus === 'arrived_us_warehouse');
  const hasOrdered = activeItems.some(item => item.itemStatus === 'ordered_from_supplier');

  if (hasDelivered) return 'shipped_to_customer'; // יש פריטים שנמסרו
  if (hasReadyForDelivery) return 'ready_for_delivery';
  if (hasArrivedIsrael) return 'arrived_israel_warehouse';
  if (hasShippedToIsrael) return 'shipped_to_israel';
  if (hasArrivedUS) return 'arrived_us_warehouse';
  if (hasOrdered) return 'ordered';

  return 'pending';
}

/**
 * סטטיסטיקות הזמנה
 */
export function getOrderStatistics(order) {
  const activeItems = getActiveItems(order.items);
  const cancelledItems = order.items.filter(item => item.cancellation?.cancelled);

  const itemsByStatus = {};
  activeItems.forEach(item => {
    itemsByStatus[item.itemStatus] = (itemsByStatus[item.itemStatus] || 0) + 1;
  });

  return {
    totalItems: order.items.length,
    activeItems: activeItems.length,
    cancelledItems: cancelledItems.length,
    itemsByStatus,
    totalRefunds: calculateTotalRefunds(order.items),
    activeTotal: calculateActiveItemsTotal(order.items),
    minimumCheck: checkOrderMinimumRequirements(order)
  };
}

export default {
  calculateActiveItemsTotal,
  getActiveItems,
  calculateTotalRefunds,
  calculateItemRefund,
  calculateAdjustedTotal,
  checkOrderMinimumRequirements,
  updateOrderPricing,
  createRefundRecord,
  areAllItemsCancelled,
  areAllItemsDelivered,
  computeOrderStatusFromItems,
  getOrderStatistics
};
