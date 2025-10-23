// middleware/auditLogger.js - רישום אוטומטי של פעולות Admin

import AdminLog from '../models/AdminLog.js';

// מיפוי של routes לפעולות
const ACTION_MAP = {
  'POST /api/admin/products': 'CREATE_PRODUCT',
  'PUT /api/admin/products': 'UPDATE_PRODUCT',
  'DELETE /api/admin/products': 'DELETE_PRODUCT',
  'GET /api/admin/dashboard': 'VIEW_DASHBOARD',
  'GET /api/admin/orders': 'VIEW_ALL_ORDERS',
  'PUT /api/admin/orders': 'UPDATE_ORDER_STATUS',
};

// Middleware שרץ אחרי הפעולה ורושם אותה
export const auditLogger = (action, resourceType) => {
  return async (req, res, next) => {
    // שומר את הפונקציה המקורית של res.json
    const originalJson = res.json.bind(res);

    // עוקף את res.json כדי לתפוס את התוצאה
    res.json = function(data) {
      // רק אם הפעולה הצליחה (2xx status)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // רושם את הפעולה ברקע (לא חוסם)
        AdminLog.logAction({
          user: req.user,
          action: action,
          resourceType: resourceType,
          resourceId: data?.data?._id || req.params.id || null,
          details: {
            method: req.method,
            path: req.originalUrl,
            body: sanitizeBody(req.body), // מסנן סיסמאות וכו'
            params: req.params,
            query: req.query
          },
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent')
        }).catch(err => {
          console.error('Audit log failed:', err);
        });
      } else {
        // רושם כשלון
        AdminLog.logFailure({
          user: req.user,
          action: action,
          resourceType: resourceType,
          resourceId: req.params.id || null,
          details: {
            method: req.method,
            path: req.originalUrl
          },
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent'),
          error: data?.message || 'Unknown error'
        }).catch(err => {
          console.error('Audit log failed:', err);
        });
      }

      // קורא לפונקציה המקורית
      return originalJson(data);
    };

    next();
  };
};

// מסנן מידע רגיש מה-body
function sanitizeBody(body) {
  if (!body) return {};

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

// Helper function - שימוש פשוט יותר
export const logAdminAction = (action, resourceType = 'General') => {
  return auditLogger(action, resourceType);
};

export default auditLogger;
