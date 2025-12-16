/**
 * Auto Status Update Utility
 *
 * ✨ NEW: אוטומציה מלאה לעדכון סטטוס ראשי של הזמנה
 * המערכת מסנכרנת אוטומטית את order.status עם סטטוסי הפריטים
 */

import { ORDER_STATUS } from '../constants/orderStatuses.js';
import { ITEM_STATUS } from '../constants/itemStatuses.js';

/**
 * חישוב סטטוס ראשי אוטומטי על בסיס סטטוסי הפריטים
 *
 * ✨ LOGIC: הסטטוס נקבע לפי הפריט הכי פחות מתקדם
 *
 * @param {Array} items - רשימת פריטים
 * @returns {String} - סטטוס ראשי מחושב
 */
export function calculateAutoOrderStatus(items) {
  if (!items || items.length === 0) {
    return ORDER_STATUS.PENDING;
  }

  // סינון פריטים פעילים (לא מבוטלים)
  const activeItems = items.filter(item => !item.cancellation?.cancelled);

  // אם כל הפריטים בוטלו
  if (activeItems.length === 0) {
    return ORDER_STATUS.CANCELLED;
  }

  // ספירת פריטים לפי סטטוס
  const statusCounts = {};
  activeItems.forEach(item => {
    const status = item.itemStatus || ITEM_STATUS.PENDING;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  const totalActive = activeItems.length;

  // ✅ Rule 1: אם כל הפריטים נמסרו
  if (statusCounts[ITEM_STATUS.DELIVERED] === totalActive) {
    return ORDER_STATUS.DELIVERED;
  }

  // ✅ Rule 2: אם יש לפחות פריט אחד שנשלח או נמסר ללקוח
  if (
    (statusCounts[ITEM_STATUS.SHIPPED_TO_CUSTOMER] || 0) +
    (statusCounts[ITEM_STATUS.DELIVERED] || 0) > 0
  ) {
    return ORDER_STATUS.SHIPPED;
  }

  // ✅ Rule 3: אם כל הפריטים הגיעו לישראל
  if (statusCounts[ITEM_STATUS.ARRIVED_ISRAEL] === totalActive) {
    return ORDER_STATUS.READY_TO_SHIP;
  }

  // ✅ Rule 4: אם יש לפחות פריט אחד שהוזמן או בדרך
  if (
    (statusCounts[ITEM_STATUS.ORDERED] || 0) +
    (statusCounts[ITEM_STATUS.IN_TRANSIT] || 0) +
    (statusCounts[ITEM_STATUS.ARRIVED_ISRAEL] || 0) > 0
  ) {
    return ORDER_STATUS.IN_PROGRESS;
  }

  // ✅ Rule 5: אם כל הפריטים עדיין pending
  return ORDER_STATUS.PENDING;
}

/**
 * קבלת הסבר למה הסטטוס הוא מה שהוא
 *
 * @param {Array} items - רשימת פריטים
 * @param {String} calculatedStatus - הסטטוס המחושב
 * @returns {String} - הסבר
 */
export function getStatusExplanation(items, calculatedStatus) {
  const activeItems = items.filter(item => !item.cancellation?.cancelled);

  if (activeItems.length === 0) {
    return 'כל הפריטים בהזמנה בוטלו';
  }

  const statusCounts = {};
  activeItems.forEach(item => {
    const status = item.itemStatus || ITEM_STATUS.PENDING;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  const total = activeItems.length;

  switch (calculatedStatus) {
    case ORDER_STATUS.DELIVERED:
      return `כל ${total} הפריטים נמסרו ללקוח`;

    case ORDER_STATUS.SHIPPED:
      const shippedOrDelivered =
        (statusCounts[ITEM_STATUS.SHIPPED_TO_CUSTOMER] || 0) +
        (statusCounts[ITEM_STATUS.DELIVERED] || 0);
      return `${shippedOrDelivered} מתוך ${total} פריטים נשלחו או נמסרו`;

    case ORDER_STATUS.READY_TO_SHIP:
      return `כל ${total} הפריטים הגיעו למחסן בישראל`;

    case ORDER_STATUS.IN_PROGRESS:
      const inProgress =
        (statusCounts[ITEM_STATUS.ORDERED] || 0) +
        (statusCounts[ITEM_STATUS.IN_TRANSIT] || 0) +
        (statusCounts[ITEM_STATUS.ARRIVED_ISRAEL] || 0);
      return `${inProgress} מתוך ${total} פריטים בתהליך הזמנה או משלוח`;

    case ORDER_STATUS.PENDING:
      return `${total} פריטים ממתינים להזמנה`;

    default:
      return 'סטטוס לא ידוע';
  }
}

/**
 * בדיקה אם יש צורך לעדכן את הסטטוס הראשי
 *
 * @param {Object} order - אובייקט ההזמנה
 * @returns {Object|null} - null אם אין צורך בעדכון, או אובייקט עם פרטי העדכון
 */
export function shouldUpdateOrderStatus(order) {
  const currentStatus = order.status;
  const calculatedStatus = calculateAutoOrderStatus(order.items);

  // אם הסטטוס זהה - אין צורך בעדכון
  if (currentStatus === calculatedStatus) {
    return null;
  }

  // אם זה סטטוס מיוחד שלא רוצים לשנות אוטומטית
  const protectedStatuses = ['payment_hold']; // סטטוסים ישנים שעדיין קיימים
  if (protectedStatuses.includes(currentStatus)) {
    return null;
  }

  return {
    shouldUpdate: true,
    from: currentStatus,
    to: calculatedStatus,
    reason: getStatusExplanation(order.items, calculatedStatus),
    autoUpdated: true
  };
}

/**
 * ✨ NEW: פונקציה ראשית שמעדכנת את הסטטוס אוטומטית
 * נקראת מתוך pre-save hook
 *
 * @param {Object} order - אובייקט ההזמנה (Mongoose document)
 */
export function applyAutoStatusUpdate(order) {
  const update = shouldUpdateOrderStatus(order);

  if (!update) {
    return; // אין צורך בעדכון
  }

  // עדכן את הסטטוס
  order.status = update.to;

  // הוסף ל-timeline
  order.timeline.push({
    status: update.to,
    message: `🤖 עדכון אוטומטי: ${update.reason}`,
    timestamp: new Date(),
    automated: true
  });
}

/**
 * פישוט לוגיקת needsAttention - אחיד לכל ההזמנות
 *
 * ✨ NEW: הסרת המקרה המיוחד לפריט יחיד
 *
 * @param {Object} order - אובייקט ההזמנה
 * @returns {Boolean} - האם צריך תשומת לב
 */
export function calculateNeedsAttention(order) {
  const activeItems = order.items.filter(item => !item.cancellation?.cancelled);

  // אם אין פריטים פעילים - לא צריך תשומת לב
  if (activeItems.length === 0) {
    return false;
  }

  const now = Date.now();
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

  // בדוק אם יש פריטים שלא עודכנו 3 ימים
  const hasStuckItems = activeItems.some(item => {
    // דלג על פריטים שכבר נמסרו
    if (item.itemStatus === ITEM_STATUS.DELIVERED) {
      return false;
    }

    // מצא את העדכון האחרון
    const lastUpdate = item.statusHistory && item.statusHistory.length > 0
      ? new Date(item.statusHistory[item.statusHistory.length - 1].changedAt)
      : new Date(order.createdAt);

    const timeSinceUpdate = now - lastUpdate.getTime();

    return timeSinceUpdate >= THREE_DAYS;
  });

  return hasStuckItems;
}

/**
 * חישוב אחוז השלמה של ההזמנה
 *
 * @param {Array} items - רשימת פריטים
 * @returns {Number} - אחוז השלמה (0-100)
 */
export function calculateCompletionPercentage(items) {
  const activeItems = items.filter(item => !item.cancellation?.cancelled);

  if (activeItems.length === 0) {
    return 100; // אם הכל בוטל - 100%
  }

  const deliveredCount = activeItems.filter(
    item => item.itemStatus === ITEM_STATUS.DELIVERED
  ).length;

  return Math.round((deliveredCount / activeItems.length) * 100);
}

export default {
  calculateAutoOrderStatus,
  getStatusExplanation,
  shouldUpdateOrderStatus,
  applyAutoStatusUpdate,
  calculateNeedsAttention,
  calculateCompletionPercentage
};
