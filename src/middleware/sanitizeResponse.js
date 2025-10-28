// middleware/sanitizeResponse.js - סינון שדות רגישים מהתגובות

/**
 * Middleware לסינון אוטומטי של שדות רגישים מהתגובות הציבוריות
 * מונע חשיפת מידע עסקי רגיש ללקוחות
 */

const SENSITIVE_FIELDS = [
  'costBreakdown',           // פירוט עלויות - רווחים
  'stats.sales',             // מספר מכירות - מידע עסקי
  'links',                   // כל הקישורים (אמזון, ספקים)
  'asin',                    // מזהה אמזון - חושף מקור
  'rating.amazonRating',     // דירוג אמזון
  'rating.amazonReviewsCount', // ביקורות אמזון
  '__v',                     // גרסת מסמך MongoDB
];

/**
 * מסנן שדות רגישים מאובייקט
 * @param {Object} obj - האובייקט לסינון
 * @param {Array} fieldsToRemove - רשימת שדות להסרה
 * @param {WeakSet} seen - מעקב אחרי אובייקטים שכבר עברנו (למניעת circular references)
 */
const sanitizeObject = (obj, fieldsToRemove = SENSITIVE_FIELDS, seen = new WeakSet()) => {
  if (!obj || typeof obj !== 'object') return obj;

  // בדיקת circular reference - אם כבר ראינו את האובייקט הזה, נעצור
  if (seen.has(obj)) {
    return obj;
  }

  // אם זה מערך, נסנן כל אובייקט בו
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, fieldsToRemove, seen));
  }

  // סימון שראינו את האובייקט הזה
  seen.add(obj);

  // המרת Mongoose Document לאובייקט רגיל אם צריך
  const plainObj = obj.toObject ? obj.toObject() : obj;

  // יצירת עותק של האובייקט
  const sanitized = { ...plainObj };

  // מחיקת שדות רגישים
  fieldsToRemove.forEach(field => {
    // תמיכה בנתיבים מקוננים (למשל: stats.sales)
    const parts = field.split('.');

    if (parts.length === 1) {
      delete sanitized[field];
    } else {
      // שדה מקונן
      let current = sanitized;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) return;
        current = current[parts[i]];
      }
      delete current[parts[parts.length - 1]];
    }
  });

  // סינון רקורסיבי של שדות מקוננים
  Object.keys(sanitized).forEach(key => {
    if (sanitized[key] && typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeObject(sanitized[key], fieldsToRemove, seen);
    }
  });

  return sanitized;
};

/**
 * Middleware - מסנן תגובות ציבוריות אוטומטית
 * משמש רק בנתיבים ציבוריים (לא admin)
 */
export const sanitizePublicResponse = (req, res, next) => {
  // שמירת הפונקציה המקורית
  const originalJson = res.json.bind(res);

  // החלפה לפונקציה מסננת
  res.json = function (data) {
    // בודקים אם זה נתיב ציבורי (לא admin)
    const isPublicRoute = !req.path.includes('/admin');

    if (isPublicRoute && data && data.data) {
      // סינון הנתונים
      data.data = sanitizeObject(data.data);
    }

    return originalJson(data);
  };

  next();
};

/**
 * פונקציה עזר לסינון ידני של מוצר בודד
 */
export const sanitizeProduct = (product) => {
  if (!product) return null;

  const sanitized = product.toObject ? product.toObject() : { ...product };

  return sanitizeObject(sanitized);
};

/**
 * פונקציה עזר לסינון מערך מוצרים
 */
export const sanitizeProducts = (products) => {
  if (!Array.isArray(products)) return [];

  return products.map(product => sanitizeProduct(product));
};

export default {
  sanitizePublicResponse,
  sanitizeProduct,
  sanitizeProducts,
  SENSITIVE_FIELDS
};
