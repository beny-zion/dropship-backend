// middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';

// 🔒 Rate Limiter עבור נתיבי Admin - מגביל בקשות אבל לא יותר מדי
export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // חלון זמן: 15 דקות
  max: 200, // מקסימום 200 בקשות בחלון (מספיק נדיב)
  message: {
    success: false,
    message: 'יותר מדי בקשות מהכתובת הזו, נסה שוב בעוד 15 דקות'
  },
  standardHeaders: true, // מחזיר RateLimit-* headers
  legacyHeaders: false, // מכבה X-RateLimit-* headers
  // אפשר לעקוף עבור IPs ספציפיים (למשל staging server)
  skip: (req) => {
    // אם יש IP של staging/dev - לא להגביל
    const whitelistedIPs = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];
    return whitelistedIPs.includes(req.ip);
  }
});

// 🔒 Rate Limiter עבור Auth routes - מגן מפני brute force
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 דקות
  max: 10, // רק 10 ניסיונות התחברות בחלון
  skipSuccessfulRequests: true, // אם התחברות הצליחה - לא נספור
  message: {
    success: false,
    message: 'יותר מדי ניסיונות התחברות, נסה שוב בעוד 15 דקות'
  }
});

// 🔒 Rate Limiter כללי לכל ה-API
export const generalRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // דקה אחת
  max: 100, // 100 בקשות לדקה (מאוד נדיב)
  message: {
    success: false,
    message: 'יותר מדי בקשות, נסה שוב בעוד דקה'
  }
});

export default {
  adminRateLimiter,
  authRateLimiter,
  generalRateLimiter
};
