/**
 * Audit Middleware
 *
 * Middleware לרישום פעולות במערכת
 */

import AuditLog from '../models/AuditLog.js';

/**
 * Middleware לרישום פעולות אדמין
 */
export const auditLog = (action, targetType) => {
  return async (req, res, next) => {
    const startTime = Date.now();

    // שמור את הפונקציה המקורית של res.json
    const originalJson = res.json.bind(res);

    // Override res.json לרישום הפעולה
    res.json = function(data) {
      const duration = Date.now() - startTime;

      // רשום אסינכרונית (לא חוסם את התגובה)
      setImmediate(async () => {
        try {
          const logData = {
            user: req.user?._id,
            userEmail: req.user?.email,
            userName: req.user ? `${req.user.firstName} ${req.user.lastName}` : 'Unknown',
            action,
            targetType,
            targetId: req.params.id || req.params.orderId || req.params.itemId,
            details: {
              params: req.params,
              query: req.query,
              // לא שומרים sensitive data כמו סיסמאות
              body: sanitizeBody(req.body)
            },
            metadata: {
              ipAddress: req.ip || req.connection.remoteAddress,
              userAgent: req.get('user-agent'),
              method: req.method,
              endpoint: req.originalUrl,
              statusCode: res.statusCode
            },
            status: res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure',
            errorMessage: data.success === false ? data.message : null,
            timestamp: new Date(),
            duration
          };

          await AuditLog.logAction(logData);
        } catch (error) {
          console.error('Audit log error:', error);
          // לא זורק שגיאה - הפעולה המקורית חייבת להמשיך
        }
      });

      // קרא לפונקציה המקורית
      return originalJson(data);
    };

    next();
  };
};

/**
 * ניקוי sensitive data מה-body
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'creditCard', 'cvv', 'ssn'];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  });

  return sanitized;
}

/**
 * Middleware לרישום שגיאות
 */
export const auditError = async (error, req, res, next) => {
  try {
    await AuditLog.logAction({
      user: req.user?._id,
      userEmail: req.user?.email,
      userName: req.user ? `${req.user.firstName} ${req.user.lastName}` : 'Unknown',
      action: 'ERROR',
      targetType: 'System',
      details: {
        errorMessage: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        endpoint: req.originalUrl,
        method: req.method
      },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        method: req.method,
        endpoint: req.originalUrl,
        statusCode: error.statusCode || 500
      },
      status: 'failure',
      errorMessage: error.message,
      timestamp: new Date()
    });
  } catch (auditError) {
    console.error('Failed to log error:', auditError);
  }

  next(error);
};

export default {
  auditLog,
  auditError
};
