/**
 * Order Status Constants - SIMPLIFIED
 *
 * ✨ NEW: צומצם מ-10 ל-6 סטטוסים ראשיים בלבד
 * הפרדה ברורה: סטטוסי Order = מצב כללי, סטטוסי Item = פירוט
 */

export const ORDER_STATUS = {
  PENDING: 'pending',                // ממתין לטיפול/אישור
  IN_PROGRESS: 'in_progress',        // בתהליך (הוזמן, בדרך, וכו')
  READY_TO_SHIP: 'ready_to_ship',    // הגיע למחסן בישראל, מוכן למשלוח
  SHIPPED: 'shipped',                // נשלח ללקוח
  DELIVERED: 'delivered',            // נמסר ללקוח
  CANCELLED: 'cancelled'             // בוטל
};

export const ORDER_STATUS_LABELS = {
  [ORDER_STATUS.PENDING]: 'ממתין לטיפול',
  [ORDER_STATUS.IN_PROGRESS]: 'בתהליך',
  [ORDER_STATUS.READY_TO_SHIP]: 'מוכן למשלוח',
  [ORDER_STATUS.SHIPPED]: 'נשלח ללקוח',
  [ORDER_STATUS.DELIVERED]: 'נמסר',
  [ORDER_STATUS.CANCELLED]: 'בוטל'
};

export const ORDER_STATUS_COLORS = {
  [ORDER_STATUS.PENDING]: 'bg-gray-100 text-gray-700 border-gray-300',
  [ORDER_STATUS.IN_PROGRESS]: 'bg-blue-100 text-blue-700 border-blue-300',
  [ORDER_STATUS.READY_TO_SHIP]: 'bg-purple-100 text-purple-700 border-purple-300',
  [ORDER_STATUS.SHIPPED]: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  [ORDER_STATUS.DELIVERED]: 'bg-green-100 text-green-700 border-green-300',
  [ORDER_STATUS.CANCELLED]: 'bg-red-100 text-red-700 border-red-300'
};

// תיאורים מפורטים לממשק המשתמש
export const ORDER_STATUS_DESCRIPTIONS = {
  [ORDER_STATUS.PENDING]: 'ההזמנה התקבלה וממתינה לטיפול',
  [ORDER_STATUS.IN_PROGRESS]: 'פריטים בתהליך הזמנה או משלוח',
  [ORDER_STATUS.READY_TO_SHIP]: 'כל הפריטים הגיעו למחסן בישראל',
  [ORDER_STATUS.SHIPPED]: 'ההזמנה נשלחה ללקוח',
  [ORDER_STATUS.DELIVERED]: 'ההזמנה נמסרה ללקוח',
  [ORDER_STATUS.CANCELLED]: 'ההזמנה בוטלה'
};

// איקונים מומלצים לכל סטטוס (לשימוש ב-Frontend)
export const ORDER_STATUS_ICONS = {
  [ORDER_STATUS.PENDING]: 'Clock',
  [ORDER_STATUS.IN_PROGRESS]: 'Package',
  [ORDER_STATUS.READY_TO_SHIP]: 'PackageCheck',
  [ORDER_STATUS.SHIPPED]: 'Truck',
  [ORDER_STATUS.DELIVERED]: 'CheckCircle',
  [ORDER_STATUS.CANCELLED]: 'XCircle'
};

/**
 * ✨ NEW: Automatic status progression rules
 * מיפוי בין סטטוסי פריטים לסטטוס ראשי
 */
export const ITEM_TO_ORDER_STATUS_MAPPING = {
  // אם כל הפריטים pending
  'all_pending': ORDER_STATUS.PENDING,

  // אם לפחות פריט אחד הוזמן/בדרך/במכס
  'some_in_transit': ORDER_STATUS.IN_PROGRESS,

  // אם כל הפריטים הגיעו לישראל
  'all_arrived_israel': ORDER_STATUS.READY_TO_SHIP,

  // אם יש פריטים שנמסרו אבל לא הכל
  'some_delivered': ORDER_STATUS.SHIPPED,

  // אם כל הפריטים נמסרו
  'all_delivered': ORDER_STATUS.DELIVERED,

  // אם כל הפריטים בוטלו
  'all_cancelled': ORDER_STATUS.CANCELLED
};

/**
 * ✨ NEW: Order priority levels
 * עדיפות הזמנה (לצורך מיון ותצוגה)
 */
export const ORDER_PRIORITY = {
  URGENT: 'urgent',       // דורש טיפול מיידי
  HIGH: 'high',          // עדיפות גבוהה
  NORMAL: 'normal',      // רגיל
  LOW: 'low'            // עדיפות נמוכה
};

export const ORDER_PRIORITY_LABELS = {
  [ORDER_PRIORITY.URGENT]: 'דחוף',
  [ORDER_PRIORITY.HIGH]: 'גבוה',
  [ORDER_PRIORITY.NORMAL]: 'רגיל',
  [ORDER_PRIORITY.LOW]: 'נמוך'
};

/**
 * בדיקה אם סטטוס תקין
 */
export function isValidOrderStatus(status) {
  return Object.values(ORDER_STATUS).includes(status);
}

/**
 * קבלת צבע לפי סטטוס
 */
export function getOrderStatusColor(status) {
  return ORDER_STATUS_COLORS[status] || ORDER_STATUS_COLORS[ORDER_STATUS.PENDING];
}

/**
 * קבלת תווית לפי סטטוס
 */
export function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status;
}

export default {
  ORDER_STATUS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_DESCRIPTIONS,
  ORDER_STATUS_ICONS,
  ITEM_TO_ORDER_STATUS_MAPPING,
  ORDER_PRIORITY,
  ORDER_PRIORITY_LABELS,
  isValidOrderStatus,
  getOrderStatusColor,
  getOrderStatusLabel
};
