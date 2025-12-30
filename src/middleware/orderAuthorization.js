/**
 * Order Authorization Middleware
 *
 * בדיקת הרשאות לפעולות על הזמנות
 */

import Order from '../models/Order.js';
import AuditLog from '../models/AuditLog.js';

/**
 * בדיקה שהמשתמש מורשה לצפות/לערוך הזמנה
 */
export const checkOrderAccess = (requiredAction = 'view') => {
  return async (req, res, next) => {
    try {
      const { orderId, id } = req.params;
      const orderIdToCheck = orderId || id;

      if (!orderIdToCheck) {
        return res.status(400).json({
          success: false,
          message: 'מזהה הזמנה חסר'
        });
      }

      // מצא הזמנה
      const order = await Order.findById(orderIdToCheck).select('user status');

      if (!order) {
        // רשום ניסיון גישה להזמנה שלא קיימת
        await AuditLog.logAction({
          user: req.user._id,
          userEmail: req.user.email,
          action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
          targetType: 'Order',
          targetId: orderIdToCheck,
          status: 'failure',
          errorMessage: 'ניסיון גישה להזמנה שלא קיימת',
          metadata: {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          }
        });

        return res.status(404).json({
          success: false,
          message: 'הזמנה לא נמצאה'
        });
      }

      const user = req.user;

      // אדמינים ומנהלים רואים הכל
      if (user.role === 'admin' || user.role === 'manager') {
        req.order = order; // שמור את ההזמנה ב-request
        return next();
      }

      // לקוחות רואים רק הזמנות שלהם
      if (user.role === 'customer') {
        if (order.user.toString() !== user._id.toString()) {
          // רשום ניסיון גישה לא מורשה
          await AuditLog.logAction({
            user: user._id,
            userEmail: user.email,
            action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
            targetType: 'Order',
            targetId: orderIdToCheck,
            status: 'failure',
            errorMessage: 'לקוח ניסה לגשת להזמנה של לקוח אחר',
            metadata: {
              ipAddress: req.ip,
              userAgent: req.get('user-agent')
            }
          });

          return res.status(403).json({
            success: false,
            message: 'אין לך הרשאה לצפות בהזמנה זו'
          });
        }

        // לקוחות לא יכולים לערוך הזמנות
        if (requiredAction === 'edit' || requiredAction === 'delete') {
          return res.status(403).json({
            success: false,
            message: 'אין לך הרשאה לבצע פעולה זו'
          });
        }

        req.order = order;
        return next();
      }

      // תפקיד לא ידוע
      return res.status(403).json({
        success: false,
        message: 'אין לך הרשאה לבצע פעולה זו'
      });

    } catch (error) {
      console.error('Order authorization error:', error);
      return res.status(500).json({
        success: false,
        message: 'שגיאה בבדיקת הרשאות'
      });
    }
  };
};

/**
 * בדיקה שהמשתמש הוא אדמין או מנהל
 */
export const requireAdminOrManager = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'נדרשת התחברות'
    });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    // רשום ניסיון גישה לא מורשה
    AuditLog.logAction({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      targetType: 'System',
      status: 'failure',
      errorMessage: 'ניסיון גישה לפונקציונליות אדמין ללא הרשאות',
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        endpoint: req.originalUrl
      }
    });

    return res.status(403).json({
      success: false,
      message: 'דרושות הרשאות אדמין או מנהל'
    });
  }

  next();
};

/**
 * בדיקה שהמשתמש הוא אדמין בלבד (לא מנהל)
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'נדרשת התחברות'
    });
  }

  if (req.user.role !== 'admin') {
    AuditLog.logAction({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      targetType: 'System',
      status: 'failure',
      errorMessage: 'ניסיון גישה לפונקציונליות אדמין ללא הרשאות',
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        endpoint: req.originalUrl
      }
    });

    return res.status(403).json({
      success: false,
      message: 'דרושות הרשאות אדמין'
    });
  }

  next();
};

/**
 * Rate limiting לפי משתמש
 */
const userRequestCounts = new Map();

// ✅ MEMORY LEAK FIX: Cleanup old entries every 10 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const ENTRY_TTL = 60 * 60 * 1000; // 1 hour

setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [userId, data] of userRequestCounts.entries()) {
    // מחק רשומות שלא היו פעילות במשך שעה
    if (now > data.resetTime + ENTRY_TTL) {
      userRequestCounts.delete(userId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[Rate Limiter Cleanup] Removed ${cleanedCount} stale entries. Current size: ${userRequestCounts.size}`);
  }
}, CLEANUP_INTERVAL);

export const userRateLimit = (maxRequests = 100, windowMs = 60000) => {
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user._id.toString();
    const now = Date.now();

    // נקה רשומות ישנות
    if (!userRequestCounts.has(userId)) {
      userRequestCounts.set(userId, {
        count: 0,
        resetTime: now + windowMs
      });
    }

    const userLimit = userRequestCounts.get(userId);

    // אם החלון עבר - אפס
    if (now > userLimit.resetTime) {
      userLimit.count = 0;
      userLimit.resetTime = now + windowMs;
    }

    // בדוק limit
    if (userLimit.count >= maxRequests) {
      AuditLog.logAction({
        user: req.user._id,
        userEmail: req.user.email,
        action: 'RATE_LIMIT_EXCEEDED',
        targetType: 'System',
        status: 'failure',
        errorMessage: `חרג ממגבלת ${maxRequests} בקשות בדקה`,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          endpoint: req.originalUrl
        }
      });

      return res.status(429).json({
        success: false,
        message: 'יותר מדי בקשות. נסה שוב מאוחר יותר',
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
      });
    }

    // הגדל counter
    userLimit.count++;
    next();
  };
};

export default {
  checkOrderAccess,
  requireAdminOrManager,
  requireAdmin,
  userRateLimit
};
