/**
 * Item Status Constants
 *
 * סטטוסים של פריטים בהזמנה
 */

export const ITEM_STATUS = {
  PENDING: 'pending',
  ORDERED_FROM_SUPPLIER: 'ordered_from_supplier',
  ARRIVED_US_WAREHOUSE: 'arrived_us_warehouse',
  SHIPPED_TO_ISRAEL: 'shipped_to_israel',
  CUSTOMS_ISRAEL: 'customs_israel',
  ARRIVED_ISRAEL: 'arrived_israel',
  READY_FOR_DELIVERY: 'ready_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};

export const ITEM_STATUS_LABELS = {
  [ITEM_STATUS.PENDING]: 'ממתין לטיפול',
  [ITEM_STATUS.ORDERED_FROM_SUPPLIER]: 'הוזמן מספק',
  [ITEM_STATUS.ARRIVED_US_WAREHOUSE]: 'הגיע למחסן ארה"ב',
  [ITEM_STATUS.SHIPPED_TO_ISRAEL]: 'נשלח לישראל',
  [ITEM_STATUS.CUSTOMS_ISRAEL]: 'במכס בישראל',
  [ITEM_STATUS.ARRIVED_ISRAEL]: 'הגיע לישראל',
  [ITEM_STATUS.READY_FOR_DELIVERY]: 'מוכן למשלוח',
  [ITEM_STATUS.DELIVERED]: 'נמסר',
  [ITEM_STATUS.CANCELLED]: 'בוטל'
};

export const ITEM_STATUS_COLORS = {
  [ITEM_STATUS.PENDING]: 'bg-gray-100 text-gray-700',
  [ITEM_STATUS.ORDERED_FROM_SUPPLIER]: 'bg-blue-100 text-blue-700',
  [ITEM_STATUS.ARRIVED_US_WAREHOUSE]: 'bg-indigo-100 text-indigo-700',
  [ITEM_STATUS.SHIPPED_TO_ISRAEL]: 'bg-purple-100 text-purple-700',
  [ITEM_STATUS.CUSTOMS_ISRAEL]: 'bg-pink-100 text-pink-700',
  [ITEM_STATUS.ARRIVED_ISRAEL]: 'bg-cyan-100 text-cyan-700',
  [ITEM_STATUS.READY_FOR_DELIVERY]: 'bg-yellow-100 text-yellow-700',
  [ITEM_STATUS.DELIVERED]: 'bg-green-100 text-green-700',
  [ITEM_STATUS.CANCELLED]: 'bg-red-100 text-red-700'
};

// Valid status transitions (אילו מעברים מותרים)
export const ITEM_STATUS_TRANSITIONS = {
  [ITEM_STATUS.PENDING]: [
    ITEM_STATUS.ORDERED_FROM_SUPPLIER,
    ITEM_STATUS.CANCELLED
  ],
  [ITEM_STATUS.ORDERED_FROM_SUPPLIER]: [
    ITEM_STATUS.ARRIVED_US_WAREHOUSE,
    ITEM_STATUS.CANCELLED
  ],
  [ITEM_STATUS.ARRIVED_US_WAREHOUSE]: [
    ITEM_STATUS.SHIPPED_TO_ISRAEL,
    ITEM_STATUS.CANCELLED
  ],
  [ITEM_STATUS.SHIPPED_TO_ISRAEL]: [
    ITEM_STATUS.CUSTOMS_ISRAEL,
    ITEM_STATUS.ARRIVED_ISRAEL  // אפשרות לדלג על מכס אם לא רלוונטי
  ],
  [ITEM_STATUS.CUSTOMS_ISRAEL]: [
    ITEM_STATUS.ARRIVED_ISRAEL
  ],
  [ITEM_STATUS.ARRIVED_ISRAEL]: [
    ITEM_STATUS.READY_FOR_DELIVERY
  ],
  [ITEM_STATUS.READY_FOR_DELIVERY]: [
    ITEM_STATUS.DELIVERED
  ],
  [ITEM_STATUS.DELIVERED]: [],
  [ITEM_STATUS.CANCELLED]: []
};

// הודעות ברירת מחדל לכל סטטוס
export const ITEM_STATUS_MESSAGES = {
  [ITEM_STATUS.PENDING]: 'הפריט ממתין לטיפול',
  [ITEM_STATUS.ORDERED_FROM_SUPPLIER]: 'הפריט הוזמן מהספק',
  [ITEM_STATUS.ARRIVED_US_WAREHOUSE]: 'הפריט הגיע למחסן בארה"ב',
  [ITEM_STATUS.SHIPPED_TO_ISRAEL]: 'הפריט נשלח לישראל',
  [ITEM_STATUS.CUSTOMS_ISRAEL]: 'הפריט במכס בישראל',
  [ITEM_STATUS.ARRIVED_ISRAEL]: 'הפריט הגיע לישראל',
  [ITEM_STATUS.READY_FOR_DELIVERY]: 'הפריט מוכן למשלוח',
  [ITEM_STATUS.DELIVERED]: 'הפריט נמסר ללקוח',
  [ITEM_STATUS.CANCELLED]: 'הפריט בוטל'
};

/**
 * בדיקה אם מעבר סטטוס תקין
 */
export function isValidStatusTransition(currentStatus, newStatus) {
  // אם הסטטוס לא השתנה - תמיד תקין
  if (currentStatus === newStatus) {
    return true;
  }

  const allowedTransitions = ITEM_STATUS_TRANSITIONS[currentStatus];
  if (!allowedTransitions) {
    return false;
  }

  return allowedTransitions.includes(newStatus);
}

/**
 * קבלת הסטטוס הבא המומלץ
 */
export function getNextRecommendedStatus(currentStatus) {
  const transitions = ITEM_STATUS_TRANSITIONS[currentStatus];
  if (!transitions || transitions.length === 0) {
    return null;
  }
  // מחזיר את הסטטוס הראשון שאינו cancelled
  return transitions.find(s => s !== ITEM_STATUS.CANCELLED) || transitions[0];
}

export default {
  ITEM_STATUS,
  ITEM_STATUS_LABELS,
  ITEM_STATUS_COLORS,
  ITEM_STATUS_TRANSITIONS,
  ITEM_STATUS_MESSAGES,
  isValidStatusTransition,
  getNextRecommendedStatus
};
