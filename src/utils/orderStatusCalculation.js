/**
 * Order Status Calculation Utility
 *
 * חישוב סטטוס כללי של הזמנה על בסיס סטטוסים של הפריטים
 *
 * ✅ NEW: Now uses computed fields from Order model for better performance
 */

import { ITEM_STATUS } from '../constants/itemStatuses.js';

/**
 * ✅ NEW: Get computed status directly from order (fast!)
 * @param {Object} order - אובייקט ההזמנה
 * @returns {Object} computed status fields
 */
export function getComputedStatus(order) {
  return {
    overallProgress: order.computed?.overallProgress || 'pending',
    completionPercentage: order.computed?.completionPercentage || 0,
    hasActiveItems: order.computed?.hasActiveItems !== false,
    allItemsDelivered: order.computed?.allItemsDelivered || false,
    needsAttention: order.computed?.needsAttention || false
  };
}

/**
 * חישוב סטטוס כללי של הזמנה
 * @param {Object} order - אובייקט ההזמנה
 * @returns {Object} אובייקט עם סטטוס כללי וסטטיסטיקות
 */
export function calculateOrderStatus(order) {
  const items = order.items || [];

  if (items.length === 0) {
    return {
      overallStatus: 'empty',
      statusCounts: {},
      activeItemsCount: 0,
      totalItemsCount: 0,
      completionPercentage: 0
    };
  }

  // ספירת פריטים לפי סטטוס
  const statusCounts = {};
  let activeItemsCount = 0;

  items.forEach(item => {
    const status = item.itemStatus || ITEM_STATUS.PENDING;
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    // פריטים פעילים = לא מבוטלים
    if (!item.cancellation?.cancelled) {
      activeItemsCount++;
    }
  });

  const totalItemsCount = items.length;

  // קביעת סטטוס כללי
  let overallStatus;

  // אם כל הפריטים מבוטלים
  if (statusCounts[ITEM_STATUS.CANCELLED] === totalItemsCount) {
    overallStatus = 'fully_cancelled';
  }
  // אם כל הפריטים הפעילים סופקו
  else if (statusCounts[ITEM_STATUS.DELIVERED] === activeItemsCount) {
    overallStatus = 'completed';
  }
  // אם יש לפחות פריט אחד שסופק
  else if (statusCounts[ITEM_STATUS.DELIVERED] > 0) {
    overallStatus = 'partially_delivered';
  }
  // אם כל הפריטים הפעילים מוכנים למשלוח
  else if (statusCounts[ITEM_STATUS.READY_FOR_DELIVERY] === activeItemsCount) {
    overallStatus = 'ready_for_delivery';
  }
  // אם יש לפחות פריט שמוכן למשלוח
  else if (statusCounts[ITEM_STATUS.READY_FOR_DELIVERY] > 0) {
    overallStatus = 'partially_ready';
  }
  // אם כל הפריטים הגיעו לישראל
  else if (statusCounts[ITEM_STATUS.ARRIVED_ISRAEL] === activeItemsCount) {
    overallStatus = 'arrived_israel';
  }
  // אם יש פריטים בדרך לישראל או שהגיעו
  else if (
    statusCounts[ITEM_STATUS.SHIPPED_TO_ISRAEL] > 0 ||
    statusCounts[ITEM_STATUS.ARRIVED_ISRAEL] > 0
  ) {
    overallStatus = 'in_transit_to_israel';
  }
  // אם יש פריטים במחסן ארה"ב
  else if (statusCounts[ITEM_STATUS.ARRIVED_US_WAREHOUSE] > 0) {
    overallStatus = 'at_us_warehouse';
  }
  // אם כל הפריטים הוזמנו מספק
  else if (statusCounts[ITEM_STATUS.ORDERED_FROM_SUPPLIER] === activeItemsCount) {
    overallStatus = 'fully_ordered';
  }
  // אם יש לפחות פריט מוזמן
  else if (statusCounts[ITEM_STATUS.ORDERED_FROM_SUPPLIER] > 0) {
    overallStatus = 'partially_ordered';
  }
  // אם כל הפריטים ממתינים
  else if (statusCounts[ITEM_STATUS.PENDING] === activeItemsCount) {
    overallStatus = 'pending';
  }
  // מצב מעורב
  else {
    overallStatus = 'mixed';
  }

  // חישוב אחוז השלמה (בהתבסס על שלבים)
  const statusWeights = {
    [ITEM_STATUS.PENDING]: 0,
    [ITEM_STATUS.ORDERED_FROM_SUPPLIER]: 15,
    [ITEM_STATUS.ARRIVED_US_WAREHOUSE]: 30,
    [ITEM_STATUS.SHIPPED_TO_ISRAEL]: 50,
    [ITEM_STATUS.ARRIVED_ISRAEL]: 70,
    [ITEM_STATUS.READY_FOR_DELIVERY]: 85,
    [ITEM_STATUS.DELIVERED]: 100,
    [ITEM_STATUS.CANCELLED]: 0
  };

  let totalProgress = 0;
  items.forEach(item => {
    if (!item.cancellation?.cancelled) {
      totalProgress += statusWeights[item.itemStatus] || 0;
    }
  });

  const completionPercentage = activeItemsCount > 0
    ? Math.round(totalProgress / activeItemsCount)
    : 0;

  return {
    overallStatus,
    statusCounts,
    activeItemsCount,
    totalItemsCount,
    cancelledItemsCount: statusCounts[ITEM_STATUS.CANCELLED] || 0,
    completionPercentage
  };
}

/**
 * זיהוי הזמנות תקועות
 * @param {Object} order - אובייקט ההזמנה
 * @param {Number} daysThreshold - מספר ימים (ברירת מחדל 7)
 * @returns {Object} מידע על הזמנות תקועות
 */
export function detectStuckOrders(order, daysThreshold = 7) {
  const items = order.items || [];
  const now = new Date();
  const stuckItems = [];
  const alerts = [];

  items.forEach(item => {
    // דלג על פריטים מבוטלים או שסופקו
    if (
      item.cancellation?.cancelled ||
      item.itemStatus === ITEM_STATUS.DELIVERED
    ) {
      return;
    }

    // מצא את השינוי האחרון בסטטוס
    const lastStatusChange = item.statusHistory && item.statusHistory.length > 0
      ? item.statusHistory[item.statusHistory.length - 1].changedAt
      : order.createdAt;

    const daysSinceLastChange = Math.floor(
      (now - new Date(lastStatusChange)) / (1000 * 60 * 60 * 24)
    );

    // בדוק אם הפריט תקוע
    if (daysSinceLastChange >= daysThreshold) {
      stuckItems.push({
        itemId: item._id,
        itemName: item.name,
        currentStatus: item.itemStatus,
        daysSinceLastChange,
        lastStatusChange
      });
    }

    // התראות ספציפיות לפי סטטוס
    if (item.itemStatus === ITEM_STATUS.PENDING && daysSinceLastChange >= 3) {
      alerts.push({
        type: 'not_ordered',
        severity: 'high',
        message: `פריט "${item.name}" לא הוזמן מהספק כבר ${daysSinceLastChange} ימים`,
        itemId: item._id
      });
    }

    if (
      item.itemStatus === ITEM_STATUS.ORDERED_FROM_SUPPLIER &&
      daysSinceLastChange >= 14
    ) {
      alerts.push({
        type: 'supplier_delay',
        severity: 'medium',
        message: `פריט "${item.name}" הוזמן מהספק לפני ${daysSinceLastChange} ימים ועדיין לא הגיע`,
        itemId: item._id
      });
    }

    if (
      item.itemStatus === ITEM_STATUS.READY_FOR_DELIVERY &&
      daysSinceLastChange >= 5
    ) {
      alerts.push({
        type: 'delivery_pending',
        severity: 'high',
        message: `פריט "${item.name}" מוכן למשלוח כבר ${daysSinceLastChange} ימים`,
        itemId: item._id
      });
    }
  });

  return {
    hasStuckItems: stuckItems.length > 0,
    stuckItemsCount: stuckItems.length,
    stuckItems,
    alerts,
    alertsCount: alerts.length
  };
}

/**
 * קבלת סטטיסטיקות מפורטות של הזמנה
 * @param {Object} order - אובייקט ההזמנה
 * @returns {Object} סטטיסטיקות מפורטות
 */
export function getOrderStatistics(order) {
  const statusInfo = calculateOrderStatus(order);
  const stuckInfo = detectStuckOrders(order);

  // ✅ בדיקה מקיפה יותר למה צריך תשומת לב
  const needsAttention =
    stuckInfo.hasStuckItems ||
    order.status === 'pending' ||
    order.status === 'payment_hold' ||
    (statusInfo.activeItemsCount > 0 && statusInfo.activeItemsCount < 2) || // מתחת למינימום
    stuckInfo.alertsCount > 0;

  return {
    ...statusInfo,
    stuckOrders: stuckInfo,
    needsAttention
  };
}

export default {
  calculateOrderStatus,
  detectStuckOrders,
  getOrderStatistics
};
