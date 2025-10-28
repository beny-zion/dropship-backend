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

  body('images.*')
    .optional()
    .isURL()
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
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('שם המוצר באנגלית חייב להיות בין 2-200 תווים'),

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
