/**
 * Audit Log Model
 *
 * מודל לרישום כל הפעולות הקריטיות במערכת
 */

import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  // פרטי משתמש
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userEmail: String, // שכפול למקרה שהמשתמש יימחק
  userName: String,

  // פעולה שבוצעה
  action: {
    type: String,
    required: true,
    enum: [
      // Order actions
      'VIEW_ORDER',
      'UPDATE_ORDER_STATUS',
      'CANCEL_ORDER',
      'UPDATE_TRACKING',
      'ADD_ORDER_NOTES',

      // Item actions
      'UPDATE_ITEM_STATUS',
      'ORDER_FROM_SUPPLIER',
      'CANCEL_ITEM',
      'BULK_UPDATE_ITEMS',

      // User actions
      'LOGIN',
      'LOGOUT',
      'FAILED_LOGIN',
      'PASSWORD_CHANGE',

      // Admin actions
      'VIEW_ORDER_STATISTICS',
      'VIEW_ORDER_ALERTS',
      'EXPORT_DATA',

      // Product actions
      'CREATE_PRODUCT',
      'UPDATE_PRODUCT',
      'DELETE_PRODUCT',
      'MARK_AVAILABLE',
      'MARK_UNAVAILABLE',
      'CHECK_AVAILABILITY',
      'UPDATE_AVAILABILITY',

      // Settings actions
      'VIEW_SETTINGS',
      'UPDATE_SETTINGS',
      'RESET_SETTINGS',

      // Refund & Charge actions (Phase 10)
      'CHECK_CAN_REFUND',
      'CALCULATE_REFUND',
      'CREATE_REFUND',
      'VIEW_REFUNDS',
      'CHECK_CAN_CHARGE',
      'MANUAL_CHARGE',

      // Email actions (NEW)
      'SEND_BULK_EMAIL',
      'SEND_DELIVERY_EMAIL',
      'SEND_CUSTOM_EMAIL',
      'VIEW_CUSTOMERS_FOR_EMAIL',
      'SEND_EXTERNAL_EMAIL',

      // Rate limiting
      'RATE_LIMIT_EXCEEDED'
    ],
    index: true
  },

  // יעד הפעולה
  targetType: {
    type: String,
    enum: ['Order', 'OrderItem', 'User', 'Product', 'System', 'SystemSettings', 'Refund', 'Payment', 'Email'],
    index: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },

  // פרטי הפעולה
  details: {
    type: mongoose.Schema.Types.Mixed, // JSON גמיש
    default: {}
  },

  // שינויים (before/after)
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },

  // מטא-דאטה
  metadata: {
    ipAddress: String,
    userAgent: String,
    method: String, // GET, POST, PUT, DELETE
    endpoint: String, // /api/admin/orders/:id
    statusCode: Number
  },

  // תוצאה
  status: {
    type: String,
    enum: ['success', 'failure', 'partial'],
    default: 'success'
  },
  errorMessage: String,

  // זמן
  timestamp: {
    type: Date,
    default: Date.now
    // Note: index defined separately below for TTL
  },

  // משך זמן הפעולה (במילישניות)
  duration: Number

}, {
  timestamps: false // משתמשים ב-timestamp שלנו
});

// Indexes for performance
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });
auditLogSchema.index({ timestamp: -1 }); // For recent logs

// TTL Index - מחיקה אוטומטית אחרי שנה
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Static methods
auditLogSchema.statics.logAction = async function(data) {
  try {
    return await this.create(data);
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // לא זורק שגיאה כדי לא להפריע לפעולה המקורית
    return null;
  }
};

// Query helpers
auditLogSchema.query.byUser = function(userId) {
  return this.where({ user: userId });
};

auditLogSchema.query.byAction = function(action) {
  return this.where({ action });
};

auditLogSchema.query.recentLogs = function(days = 7) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  return this.where({ timestamp: { $gte: dateThreshold } });
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
