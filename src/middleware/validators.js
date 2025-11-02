// middleware/validators.js - Input Validation מקיף אבל לא מגביל

import { body, param, validationResult } from 'express-validator';

// Middleware לבדיקת תוצאות Validation
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'שגיאות בנתונים שהוזנו',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// ✅ Validation למוצר
export const validateProduct = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('שם המוצר חייב להיות בין 2-200 תווים')
    .escape(), // מונע XSS

  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('תיאור המוצר יכול להכיל עד 5000 תווים'),

  body('price')
    .isFloat({ min: 0, max: 1000000 })
    .withMessage('מחיר חייב להיות מספר חיובי (עד 1,000,000)'),

  body('category')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('קטגוריה יכולה להכיל עד 100 תווים'),

  body('brand')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('מותג יכול להכיל עד 100 תווים'),

  body('stock')
    .optional()
    .isInt({ min: 0, max: 1000000 })
    .withMessage('מלאי חייב להיות מספר שלם חיובי'),

  body('images')
    .optional()
    .isArray({ max: 10 })
    .withMessage('ניתן להעלות עד 10 תמונות'),

  body('images.*.url')
    .optional()
    .custom((value) => {
      // Allow Cloudinary URLs and other external URLs with query parameters
      try {
        new URL(value);
        return true;
      } catch {
        throw new Error('כתובת תמונה לא תקינה');
      }
    })
    .withMessage('כתובת תמונה לא תקינה'),

  validate
];

// ✅ Validation לעדכון סטטוס הזמנה
export const validateOrderStatus = [
  body('status')
    .isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
    .withMessage('סטטוס לא חוקי'),

  body('trackingNumber')
    .optional()
    .trim()
    .isLength({ min: 5, max: 50 })
    .withMessage('מספר מעקב חייב להיות בין 5-50 תווים')
    .matches(/^[A-Z0-9-]+$/i)
    .withMessage('מספר מעקב יכול להכיל רק אותיות, מספרים ומקפים'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('הערות יכולות להכיל עד 1000 תווים'),

  validate
];

// ✅ Validation ל-ID של MongoDB
export const validateMongoId = [
  param('id')
    .isMongoId()
    .withMessage('מזהה לא תקין'),

  validate
];

// ✅ Validation לעדכון מוצר (חלקי - כל השדות אופציונליים)
export const validateProductUpdate = [
  body('name_he')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('שם המוצר חייב להיות בין 2-200 תווים'),

  body('name_en')
    .optional({ values: 'falsy' }) // Allow empty string
    .trim()
    .isLength({ min: 0, max: 200 })
    .withMessage('שם המוצר באנגלית יכול להכיל עד 200 תווים'),

  body('price.ils')
    .optional()
    .isFloat({ min: 0, max: 1000000 })
    .withMessage('מחיר בשקלים חייב להיות מספר חיובי'),

  body('price.usd')
    .optional()
    .isFloat({ min: 0, max: 100000 })
    .withMessage('מחיר בדולרים חייב להיות מספר חיובי'),

  body('description_he')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('תיאור המוצר יכול להכיל עד 5000 תווים'),

  body('stock.quantity')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true; // null מותר ל-dropshipping
      if (!Number.isInteger(value) || value < 0) {
        throw new Error('מלאי חייב להיות מספר שלם חיובי או null');
      }
      return true;
    }),

  body('stock.available')
    .optional()
    .isBoolean()
    .withMessage('זמינות חייבת להיות ערך בוליאני'),

  body('stock.trackInventory')
    .optional()
    .isBoolean()
    .withMessage('מעקב מלאי חייב להיות ערך בוליאני'),

  body('images')
    .optional()
    .isArray({ max: 10 })
    .withMessage('ניתן להעלות עד 10 תמונות'),

  body('variants')
    .optional()
    .isArray({ max: 100 })
    .withMessage('ניתן להוסיף עד 100 ווריאנטים'),

  body('variants.*.sku')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('SKU חייב להיות בין 1-100 תווים'),

  body('variants.*.color')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('צבע יכול להכיל עד 50 תווים'),

  body('variants.*.size')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('מידה יכולה להכיל עד 50 תווים'),

  body('variants.*.stock.quantity')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true;
      if (!Number.isInteger(value) || value < 0) {
        throw new Error('כמות במלאי חייבת להיות מספר שלם חיובי או null');
      }
      return true;
    }),

  body('variants.*.additionalCost.ils')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('עלות נוספת בשקלים חייבת להיות מספר חיובי'),

  body('variants.*.additionalCost.usd')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('עלות נוספת בדולרים חייבת להיות מספר חיובי'),

  body('asin')
    .optional({ values: 'falsy' }) // Allow empty string or null
    .trim()
    .custom((value) => {
      if (!value) return true; // Empty is OK
      if (value.length === 10) return true; // Exactly 10 chars is OK
      throw new Error('ASIN חייב להיות בדיוק 10 תווים');
    }),

  body('supplier.name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('שם הספק יכול להכיל עד 100 תווים'),

  validate
];

// ✅ Sanitization כללי - ניקוי HTML/Scripts
export const sanitizeInput = (req, res, next) => {
  // הסרת תגי HTML מסוכנים מכל השדות
  const dangerousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi // onclick=, onerror=, etc.
  ];

  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;

    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        dangerousPatterns.forEach(pattern => {
          obj[key] = obj[key].replace(pattern, '');
        });
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      }
    }
  };

  sanitizeObject(req.body);
  next();
};

export default {
  validate,
  validateProduct,
  validateProductUpdate,
  validateOrderStatus,
  validateMongoId,
  sanitizeInput
};
