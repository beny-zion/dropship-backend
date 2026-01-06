// models/AdminLog.js - Week 5: Updated with all admin actions

import mongoose from 'mongoose';

const adminLogSchema = new mongoose.Schema({
  // מי ביצע את הפעולה
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },

  // מה נעשה
  action: {
    type: String,
    required: true,
    enum: [
      // Products
      'CREATE_PRODUCT',
      'UPDATE_PRODUCT',
      'DELETE_PRODUCT',
      'UPDATE_PRODUCT_STOCK',
      'TOGGLE_PRODUCT_FEATURED',
      'UPDATE_PRODUCT_STATUS',
      'UPDATE_PRODUCT_AVAILABILITY',
      'BULK_DELETE_PRODUCTS',
      'VIEW_PRODUCTS',
      'VIEW_PRODUCT',
      // Product Availability (New Centralized System)
      'UPDATE_AVAILABILITY_V2',
      'BATCH_UPDATE_AVAILABILITY',
      'CHECK_AVAILABILITY',
      'VIEW_AVAILABILITY_HISTORY',
      'VIEW_PRICE_HISTORY',
      'RECORD_INVENTORY_CHECK',
      'VIEW_INVENTORY_CHECK',
      // Orders
      'UPDATE_ORDER_STATUS',
      'UPDATE_TRACKING',
      'ADD_ORDER_NOTES',
      'CANCEL_ORDER',
      'REFRESH_ORDER_ITEMS',
      'VIEW_ALL_ORDERS',
      'VIEW_ORDER',
      'VIEW_ORDER_STATISTICS',
      'VIEW_ORDER_ALERTS',
      'VIEW_ORDER_KPIS',
      'VIEW_FILTERED_ORDERS',
      'VIEW_ITEMS_BY_SUPPLIER',
      // Users
      'VIEW_ALL_USERS',
      'VIEW_USER',
      'VIEW_USER_ORDERS',
      'UPDATE_USER_STATUS',
      // Dashboard
      'VIEW_DASHBOARD',
      // Settings
      'VIEW_SETTINGS',
      'UPDATE_SETTINGS',
      'RESET_SETTINGS',
      // Refunds & Charges (Phase 10)
      'CHECK_CAN_REFUND',
      'CALCULATE_REFUND',
      'CREATE_REFUND',
      'VIEW_REFUNDS',
      'CHECK_CAN_CHARGE',
      'MANUAL_CHARGE',
      // Email Management (NEW)
      'SEND_DELIVERY_EMAIL',
      'SEND_CUSTOM_EMAIL',
      'VIEW_CUSTOMERS_FOR_EMAIL',
      'SEND_EXTERNAL_EMAIL',
      // AI Processing
      'AI_PROCESS_PRODUCT'
    ]
  },

  // פרטים נוספים
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // מידע טכני
  resourceType: {
    type: String, // 'Product', 'Order', 'User'
    required: true
  },
  resourceId: {
    type: String, // ID של המוצר/הזמנה שהושפע
    default: null
  },

  // IP ו-User Agent
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    default: null
  },

  // תוצאה
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED'],
    default: 'SUCCESS'
  },
  errorMessage: {
    type: String,
    default: null
  }
}, {
  timestamps: true // createdAt, updatedAt
});

// אינדקסים לחיפוש מהיר
adminLogSchema.index({ userId: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
adminLogSchema.index({ resourceType: 1, resourceId: 1 });
adminLogSchema.index({ createdAt: -1 }); // מיון לפי תאריך

// Method להוספת לוג בקלות
adminLogSchema.statics.logAction = async function(data) {
  try {
    return await this.create({
      userId: data.user._id,
      userEmail: data.user.email,
      action: data.action,
      details: data.details || {},
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      ipAddress: data.ip,
      userAgent: data.userAgent,
      status: 'SUCCESS'
    });
  } catch (error) {
    console.error('Failed to create admin log:', error);
  }
};

// Method לרישום כשלון
adminLogSchema.statics.logFailure = async function(data) {
  try {
    return await this.create({
      userId: data.user._id,
      userEmail: data.user.email,
      action: data.action,
      details: data.details || {},
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      ipAddress: data.ip,
      userAgent: data.userAgent,
      status: 'FAILED',
      errorMessage: data.error
    });
  } catch (error) {
    console.error('Failed to create admin log:', error);
  }
};

export default mongoose.model('AdminLog', adminLogSchema);
