/**
 * Order Status Suggestion Utility
 *
 * מציע עדכון לסטטוס הראשי של ההזמנה על בסיס סטטוסי הפריטים
 */

import { ITEM_STATUS } from '../constants/itemStatuses.js';
import { calculateOrderStatus } from './orderStatusCalculation.js';

/**
 * מיפוי בין סטטוס מחושב לסטטוס ראשי
 */
const OVERALL_STATUS_TO_ORDER_STATUS = {
  'pending': 'pending',
  'fully_ordered': 'ordered',
  'partially_ordered': 'ordered', // אם יותר ממחצית הוזמנו
  'at_us_warehouse': 'arrived_us_warehouse',
  'in_transit_to_israel': 'shipped_to_israel',
  'arrived_israel': 'arrived_israel_warehouse',
  'partially_ready': 'arrived_israel_warehouse',
  'ready_for_delivery': 'arrived_israel_warehouse',
  'partially_delivered': 'shipped_to_customer',
  'completed': 'delivered',
  'fully_cancelled': 'cancelled'
};

/**
 * בודק אם כדאי להציע עדכון סטטוס ראשי
 * @param {Object} order - אובייקט ההזמנה
 * @returns {Object|null} הצעה לעדכון או null אם אין צורך
 */
export function suggestOrderStatusUpdate(order) {
  if (!order || !order.items || order.items.length === 0) {
    return null;
  }

  // חשב סטטוס כללי מהפריטים
  const stats = calculateOrderStatus(order);
  const currentStatus = order.status;

  // קבל את הסטטוס המוצע
  const suggestedStatus = getSuggestedStatus(stats, order);

  // אם אין הצעה או שהסטטוס כבר נכון - אין צורך בעדכון
  if (!suggestedStatus || suggestedStatus === currentStatus) {
    return null;
  }

  // בדוק אם ההצעה הגיונית (לא רוצים להציע חזרה לאחור)
  if (!isLogicalStatusProgression(currentStatus, suggestedStatus)) {
    return null;
  }

  return {
    shouldSuggest: true,
    currentStatus,
    suggestedStatus,
    reason: getSuggestionReason(stats, suggestedStatus),
    confidence: getConfidenceLevel(stats, order)
  };
}

/**
 * מחזיר את הסטטוס המוצע על בסיס הסטטיסטיקות
 */
function getSuggestedStatus(stats, order) {
  const activeItems = stats.activeItemsCount;

  // אם אין פריטים פעילים והכל בוטל
  if (stats.cancelledItemsCount === stats.totalItemsCount) {
    return 'cancelled';
  }

  // אם כל הפריטים הפעילים נמסרו
  if (stats.statusCounts[ITEM_STATUS.DELIVERED] === activeItems) {
    return 'delivered';
  }

  // אם רוב הפריטים הפעילים נמסרו (מעל 70%)
  const deliveredCount = stats.statusCounts[ITEM_STATUS.DELIVERED] || 0;
  if (deliveredCount > 0 && deliveredCount / activeItems >= 0.7) {
    return 'shipped_to_customer';
  }

  // אם כל הפריטים מוכנים למשלוח ללקוח
  const readyForDelivery = stats.statusCounts[ITEM_STATUS.READY_FOR_DELIVERY] || 0;
  if (readyForDelivery === activeItems) {
    return 'shipped_to_customer';
  }

  // אם כל הפריטים הגיעו לישראל
  const arrivedIsrael = stats.statusCounts[ITEM_STATUS.ARRIVED_ISRAEL] || 0;
  if (arrivedIsrael === activeItems) {
    return 'arrived_israel_warehouse';
  }

  // אם כל הפריטים במכס
  const customsIsrael = stats.statusCounts[ITEM_STATUS.CUSTOMS_ISRAEL] || 0;
  if (customsIsrael === activeItems) {
    return 'customs_israel';
  }

  // אם כל הפריטים בדרך לישראל
  if (stats.statusCounts[ITEM_STATUS.SHIPPED_TO_ISRAEL] === activeItems) {
    return 'shipped_to_israel';
  }

  // אם כל הפריטים הגיעו למחסן ארה"ב
  if (stats.statusCounts[ITEM_STATUS.ARRIVED_US_WAREHOUSE] === activeItems) {
    return 'arrived_us_warehouse';
  }

  // אם כל הפריטים הוזמנו מספק
  if (stats.statusCounts[ITEM_STATUS.ORDERED_FROM_SUPPLIER] === activeItems) {
    return 'ordered';
  }

  // אם יותר ממחצית הפריטים הוזמנו
  const orderedCount = stats.statusCounts[ITEM_STATUS.ORDERED_FROM_SUPPLIER] || 0;
  if (orderedCount > 0 && orderedCount / activeItems >= 0.5) {
    return 'ordered';
  }

  // אם עדיין יש פריטים ממתינים
  if (stats.statusCounts[ITEM_STATUS.PENDING] > 0) {
    return 'pending';
  }

  return null;
}

/**
 * בודק אם מעבר הסטטוס הגיוני (לא חוזר אחורה)
 */
function isLogicalStatusProgression(currentStatus, suggestedStatus) {
  // סדר הסטטוסים (משלב מוקדם למאוחר)
  const statusOrder = [
    'pending',
    'payment_hold',
    'ordered',
    'arrived_us_warehouse',
    'shipped_to_israel',
    'customs_israel',
    'arrived_israel_warehouse',
    'shipped_to_customer',
    'delivered'
  ];

  const currentIndex = statusOrder.indexOf(currentStatus);
  const suggestedIndex = statusOrder.indexOf(suggestedStatus);

  // אם אחד מהם לא בסדר (כמו 'cancelled'), אפשר
  if (currentIndex === -1 || suggestedIndex === -1) {
    return suggestedStatus === 'cancelled' || suggestedIndex > currentIndex;
  }

  // מעבר רק קדימה או אותו סטטוס
  return suggestedIndex >= currentIndex;
}

/**
 * מחזיר את הסיבה להצעה
 */
function getSuggestionReason(stats, suggestedStatus) {
  const readyForDeliveryCount = stats.statusCounts[ITEM_STATUS.READY_FOR_DELIVERY] || 0;
  const deliveredCount = stats.statusCounts[ITEM_STATUS.DELIVERED] || 0;

  const reasons = {
    'cancelled': `כל ${stats.totalItemsCount} הפריטים בוטלו`,
    'delivered': `כל ${stats.activeItemsCount} הפריטים הפעילים נמסרו`,
    'shipped_to_customer': readyForDeliveryCount === stats.activeItemsCount
      ? `כל ${stats.activeItemsCount} הפריטים מוכנים למשלוח ללקוח`
      : `${deliveredCount} מתוך ${stats.activeItemsCount} פריטים נמסרו`,
    'arrived_israel_warehouse': `כל ${stats.activeItemsCount} הפריטים הגיעו לישראל`,
    'customs_israel': `כל ${stats.activeItemsCount} הפריטים במכס בישראל`,
    'shipped_to_israel': `כל ${stats.activeItemsCount} הפריטים בדרך לישראל`,
    'arrived_us_warehouse': `כל ${stats.activeItemsCount} הפריטים הגיעו למחסן ארה"ב`,
    'ordered': `${stats.statusCounts[ITEM_STATUS.ORDERED_FROM_SUPPLIER] || stats.activeItemsCount} פריטים הוזמנו מהספק`,
    'pending': 'עדיין יש פריטים ממתינים'
  };

  return reasons[suggestedStatus] || 'הפריטים התקדמו לשלב הבא';
}

/**
 * מחזיר רמת ביטחון בהצעה
 */
function getConfidenceLevel(stats, order) {
  const activeItems = stats.activeItemsCount;

  // ביטחון גבוה - כל הפריטים באותו סטטוס
  const maxStatusCount = Math.max(...Object.values(stats.statusCounts));
  if (maxStatusCount === activeItems) {
    return 'high'; // 100% מהפריטים באותו מצב
  }

  // ביטחון בינוני - רוב הפריטים באותו סטטוס
  if (maxStatusCount / activeItems >= 0.7) {
    return 'medium'; // 70%+ מהפריטים באותו מצב
  }

  // ביטחון נמוך
  return 'low';
}

/**
 * מחזיר הודעה מלאה להצגה למשתמש
 */
export function getStatusSuggestionMessage(suggestion, statusLabels = {}) {
  if (!suggestion || !suggestion.shouldSuggest) {
    return null;
  }

  const confidenceEmojis = {
    high: '✅',
    medium: '💡',
    low: '💭'
  };

  const emoji = confidenceEmojis[suggestion.confidence] || '💡';
  const currentLabel = statusLabels[suggestion.currentStatus] || suggestion.currentStatus;
  const suggestedLabel = statusLabels[suggestion.suggestedStatus] || suggestion.suggestedStatus;

  return {
    emoji,
    title: 'הצעה לעדכון סטטוס ההזמנה',
    message: `${emoji} ${suggestion.reason}. רוצה לעדכן את סטטוס ההזמנה מ"${currentLabel}" ל"${suggestedLabel}"?`,
    currentStatus: suggestion.currentStatus,
    suggestedStatus: suggestion.suggestedStatus,
    confidence: suggestion.confidence
  };
}

export default {
  suggestOrderStatusUpdate,
  getStatusSuggestionMessage
};
