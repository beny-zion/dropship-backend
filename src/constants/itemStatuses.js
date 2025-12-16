/**
 * Item Status Constants - SIMPLIFIED
 *
 * ✨ NEW: פושט מ-9 ל-7 סטטוסים
 * הוסרו: customs_israel (מוזג ל-in_transit), ready_for_delivery (מוזג ל-arrived_israel)
 */

export const ITEM_STATUS = {
  PENDING: 'pending',                      // ממתין להזמנה מספק
  ORDERED: 'ordered',                      // הוזמן מספק (ממתין לקבלה)
  IN_TRANSIT: 'in_transit',                // בדרך (ארה"ב → ישראל, כולל מכס)
  ARRIVED_ISRAEL: 'arrived_israel',        // הגיע למחסן בישראל (מוכן למשלוח)
  SHIPPED_TO_CUSTOMER: 'shipped_to_customer', // נשלח ללקוח
  DELIVERED: 'delivered',                  // נמסר ללקוח
  CANCELLED: 'cancelled'                   // בוטל
};

export const ITEM_STATUS_LABELS = {
  [ITEM_STATUS.PENDING]: 'ממתין להזמנה',
  [ITEM_STATUS.ORDERED]: 'הוזמן מספק',
  [ITEM_STATUS.IN_TRANSIT]: 'בדרך לישראל',
  [ITEM_STATUS.ARRIVED_ISRAEL]: 'הגיע לישראל',
  [ITEM_STATUS.SHIPPED_TO_CUSTOMER]: 'נשלח ללקוח',
  [ITEM_STATUS.DELIVERED]: 'נמסר ללקוח',
  [ITEM_STATUS.CANCELLED]: 'בוטל'
};

export const ITEM_STATUS_COLORS = {
  [ITEM_STATUS.PENDING]: 'bg-gray-100 text-gray-700',
  [ITEM_STATUS.ORDERED]: 'bg-blue-100 text-blue-700',
  [ITEM_STATUS.IN_TRANSIT]: 'bg-purple-100 text-purple-700',
  [ITEM_STATUS.ARRIVED_ISRAEL]: 'bg-cyan-100 text-cyan-700',
  [ITEM_STATUS.SHIPPED_TO_CUSTOMER]: 'bg-indigo-100 text-indigo-700',
  [ITEM_STATUS.DELIVERED]: 'bg-green-100 text-green-700',
  [ITEM_STATUS.CANCELLED]: 'bg-red-100 text-red-700'
};

// ✨ NEW: Simplified valid status transitions
export const ITEM_STATUS_TRANSITIONS = {
  [ITEM_STATUS.PENDING]: [
    ITEM_STATUS.ORDERED,
    ITEM_STATUS.CANCELLED
  ],
  [ITEM_STATUS.ORDERED]: [
    ITEM_STATUS.IN_TRANSIT,
    ITEM_STATUS.CANCELLED
  ],
  [ITEM_STATUS.IN_TRANSIT]: [
    ITEM_STATUS.ARRIVED_ISRAEL,
    ITEM_STATUS.CANCELLED
  ],
  [ITEM_STATUS.ARRIVED_ISRAEL]: [
    ITEM_STATUS.SHIPPED_TO_CUSTOMER,
    ITEM_STATUS.DELIVERED  // אפשרות לדלג ישירות למסירה (איסוף עצמי)
  ],
  [ITEM_STATUS.SHIPPED_TO_CUSTOMER]: [
    ITEM_STATUS.DELIVERED
  ],
  [ITEM_STATUS.DELIVERED]: [],
  [ITEM_STATUS.CANCELLED]: []
};

// הודעות ברירת מחדל לכל סטטוס
export const ITEM_STATUS_MESSAGES = {
  [ITEM_STATUS.PENDING]: 'הפריט ממתין להזמנה מהספק',
  [ITEM_STATUS.ORDERED]: 'הפריט הוזמן מהספק',
  [ITEM_STATUS.IN_TRANSIT]: 'הפריט בדרך לישראל',
  [ITEM_STATUS.ARRIVED_ISRAEL]: 'הפריט הגיע למחסן בישראל',
  [ITEM_STATUS.SHIPPED_TO_CUSTOMER]: 'הפריט נשלח ללקוח',
  [ITEM_STATUS.DELIVERED]: 'הפריט נמסר ללקוח',
  [ITEM_STATUS.CANCELLED]: 'הפריט בוטל'
};

// ✨ NEW: משקלות התקדמות לחישוב אחוז השלמה
export const ITEM_STATUS_WEIGHTS = {
  [ITEM_STATUS.PENDING]: 0,
  [ITEM_STATUS.ORDERED]: 20,
  [ITEM_STATUS.IN_TRANSIT]: 50,
  [ITEM_STATUS.ARRIVED_ISRAEL]: 75,
  [ITEM_STATUS.SHIPPED_TO_CUSTOMER]: 90,
  [ITEM_STATUS.DELIVERED]: 100,
  [ITEM_STATUS.CANCELLED]: 0
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
