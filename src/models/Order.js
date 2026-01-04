import mongoose from 'mongoose';
import OrderStatus from './OrderStatus.js';

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variantSku: {
    type: String,
    trim: true,
    uppercase: true,
    default: null // null = מוצר ללא ווריאנט
  },
  variantDetails: {
    color: String,
    size: String,
    sku: String
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  image: String,
  asin: String,
  supplierLink: {
    type: String,
    validate: {
      validator: function(v) {
        // אם אין לינק - זה בסדר
        if (!v) return true;
        // אם יש לינק - חייב להיות URL תקין
        return /^https?:\/\/.+\..+/.test(v);
      },
      message: 'קישור ספק חייב להיות URL תקין (http:// או https://)'
    }
  },
  supplierName: String, // שם הספק (Amazon, Karl Lagerfeld, וכו')

  // ✅ ניהול פריט ברמת פריט - SIMPLIFIED (7 statuses)
  itemStatus: {
    type: String,
    enum: [
      'pending',                // ממתין להזמנה
      'ordered',                // הוזמן מספק
      'in_transit',             // בדרך לישראל
      'arrived_israel',         // הגיע לישראל
      'shipped_to_customer',    // נשלח ללקוח
      'delivered',              // נמסר
      'cancelled',              // בוטל
      // ⚠️ Legacy statuses - for backward compatibility during migration
      'ordered_from_supplier',  // LEGACY - maps to 'ordered'
      'arrived_us_warehouse',   // LEGACY - maps to 'in_transit'
      'shipped_to_israel',      // LEGACY - maps to 'in_transit'
      'customs_israel',         // LEGACY - maps to 'in_transit'
      'ready_for_delivery'      // LEGACY - maps to 'arrived_israel'
    ],
    default: 'pending'
  },

  // Phase 9.3: Manual status override - prevents automation from changing status
  manualStatusOverride: {
    type: Boolean,
    default: false
  },

  // פרטי הזמנה מספק
  supplierOrder: {
    orderedAt: Date,
    orderedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    supplierOrderNumber: String,      // מספר הזמנה של הספק
    supplierTrackingNumber: String,   // מספר מעקב מהספק
    actualCost: Number,               // עלות בפועל (אם שונה ממחיר צפוי)
    notes: String
  },

  // מעקב משלוח בינלאומי (מארה"ב לישראל)
  israelTracking: {
    trackingNumber: String,           // מספר מעקב בינלאומי
    carrier: String,                  // חברת משלוח (FedEx, DHL, וכו')
    shippedAt: Date,                  // תאריך שליחה
    estimatedArrival: Date,           // תאריך הגעה משוער לישראל
    arrivedAt: Date,                  // תאריך הגעה בפועל
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  },

  // מעקב משלוח ללקוח (בתוך ישראל)
  customerTracking: {
    trackingNumber: String,           // מספר מעקב למשלוח ללקוח
    carrier: String,                  // חברת משלוח (דואר ישראל, DHL, וכו')
    shippedAt: Date,                  // תאריך שליחה ללקוח
    estimatedDelivery: Date,          // תאריך משלוח משוער
    deliveredAt: Date,                // תאריך מסירה בפועל
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  },

  // ביטול פריט
  cancellation: {
    cancelled: {
      type: Boolean,
      default: false
    },
    reason: String,                   // סיבת ביטול
    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    refundAmount: Number,             // סכום החזר
    refundProcessed: {
      type: Boolean,
      default: false
    }
  },

  // היסטוריית שינויים
  statusHistory: [{
    status: String,
    changedAt: {
      type: Date,
      default: Date.now
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  }]
}, { _id: true }); // ✅ שונה ל-true כדי שכל פריט יקבל _id משלו

const shippingAddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'נא להזין שם מלא']
  },
  phone: {
    type: String,
    required: [true, 'נא להזין מספר טלפון']
  },
  email: {
    type: String,
    required: [true, 'נא להזין אימייל']
  },
  street: {
    type: String,
    required: [true, 'נא להזין רחוב']
  },
  city: {
    type: String,
    required: [true, 'נא להזין עיר']
  },
  zipCode: {
    type: String,
    required: [true, 'נא להזין מיקוד']
  },
  apartment: String,
  floor: String,
  entrance: String,
  notes: String
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  items: [orderItemSchema],
  
  shippingAddress: {
    type: shippingAddressSchema,
    required: true
  },
  
  pricing: {
    subtotal: {
      type: Number,
      required: true
    },
    tax: {
      type: Number,
      required: true
    },
    shipping: {
      type: Number,
      required: true
    },
    total: {
      type: Number,
      required: true
    },
    // ✅ שדות חדשים לניהול החזרים
    adjustedTotal: Number,      // סה"כ אחרי ביטולים (מחושב)
    totalRefunds: {             // סך כל ההחזרים
      type: Number,
      default: 0
    }
  },
  
  status: {
    type: String,
    required: true,
    default: 'awaiting_payment',
    enum: [
      'awaiting_payment',           // ✅ NEW - ממתין לתשלום (הזמנה זמנית)
      'pending',                    // ממתין לטיפול
      'in_progress',                // בתהליך
      'ready_to_ship',              // מוכן למשלוח
      'shipped',                    // נשלח ללקוח
      'delivered',                  // נמסר
      'cancelled',                  // בוטל
      // ⚠️ Legacy statuses - for backward compatibility
      'payment_hold',               // LEGACY
      'ordered',                    // LEGACY - maps to 'in_progress'
      'arrived_us_warehouse',       // LEGACY - maps to 'in_progress'
      'shipped_to_israel',          // LEGACY - maps to 'in_progress'
      'customs_israel',             // LEGACY - maps to 'in_progress'
      'arrived_israel_warehouse',   // LEGACY - maps to 'ready_to_ship'
      'shipped_to_customer'         // LEGACY - maps to 'shipped'
    ]
  },

  // Phase 9.3: Manual override for order status - prevents automation from changing
  manualStatusOverride: {
    type: Boolean,
    default: false
  },

  // ✅ NEW: TTL - זמן תפוגה להזמנה זמנית
  expiresAt: {
    type: Date,
    index: true,  // חשוב ל-Cleanup Job
    default: null
  },

  // ✅ NEW: Materialized Computed Status Fields
  computed: {
    overallProgress: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'cancelled'],
      default: 'pending'
    },
    completionPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    hasActiveItems: {
      type: Boolean,
      default: true
    },
    allItemsDelivered: {
      type: Boolean,
      default: false
    },
    needsAttention: {
      type: Boolean,
      default: false
    },
    lastComputedAt: {
      type: Date,
      default: Date.now
    }
  },

  creditHold: {
    amount: Number,           // סכום המסגרת הנעולה
    heldAt: Date,            // מתי נעל
    releasedAt: Date         // מתי שוחרר
  },
  
  payment: {
    method: {
      type: String,
      enum: ['credit_card', 'paypal', 'cash', 'bank_transfer'],
      default: 'credit_card'
    },
    // סטטוס תשלום מורחב
    status: {
      type: String,
      enum: [
        'pending',           // ממתין לתשלום
        'hold',              // מסגרת נתפסה (Postpone)
        'ready_to_charge',   // מוכן לגביה (כל פריט הוכרע)
        'retry_pending',     // ממתין לניסיון חוזר (Phase 6.5.2)
        'charged',           // נגבה בהצלחה
        'cancelled',         // בוטל (לא נגבה כלום)
        'partial_refund',    // החזר חלקי
        'full_refund',       // החזר מלא
        'failed'             // נכשל
      ],
      default: 'pending'
    },
    // מזהה עסקה ישן (לתאימות אחורה)
    transactionId: String,

    // פרטי Hyp Pay
    hypTransactionId: {
      type: String,
      index: true
    },
    hypOrderNumber: String,

    // ✅ Phase 6.5.3: J5 Protocol - Partial Capture Support
    hypAuthCode: {
      type: String,
      index: true  // ACode מהתשובה של J5 hold
    },
    hypUid: {
      type: String,
      index: true  // UID מהתשובה של J5 hold
    },

    // ✅ טוקן לביצוע Partial Capture
    hypToken: {
      type: String,
      index: true  // טוקן 19 ספרות מ-getToken
    },
    hypTokenExpiry: {
      type: String  // תוקף בפורמט YYMM
    },

    // סכומים
    holdAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    heldAmount: {
      type: Number,
      default: 0
    },
    chargedAmount: {
      type: Number,
      default: 0
    },
    refundedAmount: {
      type: Number,
      default: 0
    },

    // תאריכים
    paidAt: Date,
    holdAt: Date,
    heldAt: Date,
    chargedAt: Date,
    cancelledAt: Date,

    // שגיאות
    lastError: String,
    lastErrorCode: String,
    lastErrorAt: Date,

    // ✅ Phase 6.5.2: Retry mechanism
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    maxRetries: {
      type: Number,
      default: 3
    },
    lastRetryAt: Date,
    nextRetryAt: Date,
    retryErrors: [{
      attempt: Number,
      timestamp: Date,
      error: String,
      hypStatusCode: Number
    }],

    // 🔐 ניסיונות חשודים (Security)
    suspiciousAttempts: [{
      timestamp: Date,
      ip: String,
      expectedAmount: Number,
      receivedAmount: Number,
      transactionId: String,
      reason: {
        type: String,
        enum: ['amount_mismatch', 'invalid_signature', 'duplicate_callback']
      }
    }],

    // היסטוריית תשלומים
    paymentHistory: [{
      action: {
        type: String,
        enum: ['hold', 'charge', 'cancel', 'refund']
      },
      amount: Number,
      transactionId: String,
      success: Boolean,
      error: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  },
  
  shipping: {
    method: {
      type: String,
      enum: ['standard', 'express', 'flat_rate'],
      default: 'flat_rate'
    },
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,
    estimatedDays: Number,
    shippedAt: Date,
    deliveredAt: Date,
    // ✅ פירוט משלוח לפי ספק
    breakdown: [{
      supplier: String,
      itemCount: Number,
      subtotal: Number,
      shippingCost: Number,
      estimatedDays: Number
    }]
  },
  
  notes: String,

  // ✅ רישום החזרים (Phase 10: Enhanced)
  refunds: [{
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    reason: {
      type: String,
      required: true
    },
    items: [{
      type: mongoose.Schema.Types.ObjectId
    }],
    processedAt: Date,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },
    // Hyp Pay refund details
    hypRefundId: {
      type: String,
      index: true  // מזהה עסקת הזיכוי ב-Hyp Pay
    },
    hypACode: String,           // קוד אישור מחברת האשראי
    invoiceNumber: String,      // מספר חשבונית זיכוי
    hypError: String,           // שגיאה מ-Hyp Pay (אם נכשל)
    hypErrorCode: String,       // קוד שגיאה
    // Metadata
    refundMethod: {
      type: String,
      enum: ['hyp_pay', 'zikoyAPI', 'token', 'card', 'manual', 'bank_transfer'],
      default: 'hyp_pay'
    },
    notes: String,              // הערות אדמין
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  timeline: [{
    status: String,
    message: String,
    timestamp: {
      type: Date,
      default: () => new Date()
    },
    // Phase 9.2: internal events are hidden from customers
    internal: {
      type: Boolean,
      default: false
    }
  }]
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      // Always use _id timestamp as fallback for all dates
      const fallbackDate = doc._id.getTimestamp().toISOString();

      // Fix createdAt
      if (doc.createdAt instanceof Date) {
        ret.createdAt = doc.createdAt.toISOString();
      } else {
        ret.createdAt = fallbackDate;
      }

      // Fix updatedAt
      if (doc.updatedAt instanceof Date) {
        ret.updatedAt = doc.updatedAt.toISOString();
      } else {
        ret.updatedAt = fallbackDate;
      }

      // Fix timeline timestamps
      if (ret.timeline && Array.isArray(ret.timeline)) {
        ret.timeline = ret.timeline.map((item, index) => {
          const docItem = doc.timeline && doc.timeline[index];
          if (docItem && docItem.timestamp instanceof Date) {
            item.timestamp = docItem.timestamp.toISOString();
          } else {
            item.timestamp = fallbackDate;
          }
          return item;
        });
      }

      return ret;
    }
  },
  toObject: { virtuals: true }
});

// ✨ NEW: Auto-update status with full automation
orderSchema.pre('save', async function(next) {
  // ✅ 1. Import auto-update utilities
  const autoUpdate = await import('../utils/autoStatusUpdate.js');

  // ✅ 2. Auto-update order status based on items
  autoUpdate.applyAutoStatusUpdate(this);

  // ✅ 3. Update computed fields
  const activeItems = this.items.filter(item => !item.cancellation?.cancelled);
  const deliveredItems = activeItems.filter(item => item.itemStatus === 'delivered');

  this.computed = {
    overallProgress: calculateOverallProgress(this),
    completionPercentage: autoUpdate.calculateCompletionPercentage(this.items),
    hasActiveItems: activeItems.length > 0,
    allItemsDelivered: activeItems.length > 0 && deliveredItems.length === activeItems.length,
    needsAttention: autoUpdate.calculateNeedsAttention(this),
    lastComputedAt: new Date()
  };

  next();
});

// Add initial timeline entry
orderSchema.pre('save', function(next) {
  if (this.isNew) {
    this.timeline.push({
      status: 'pending',
      message: 'ההזמנה התקבלה',
      timestamp: new Date(),
      internal: false // Customer should see this
    });
  }
  next();
});

// ✅ NEW: Payment readiness detection hook
// זיהוי אוטומטי של מוכנות לגביה
orderSchema.pre('save', function(next) {
  // דלג אם זו הזמנה חדשה או אם כבר נגבה/בוטל
  if (this.isNew || ['charged', 'cancelled', 'failed'].includes(this.payment?.status)) {
    return next();
  }

  // בדוק רק אם יש hold פעיל
  if (this.payment?.status !== 'hold') {
    return next();
  }

  // בדוק אם כל הפריטים הוכרעו (ordered או cancelled)
  const allItemsDecided = this.items.every(item => {
    const status = item.itemStatus;
    const isCancelled = item.cancellation?.cancelled === true;

    // פריט הוכרע אם: הוזמן מספק, או בוטל
    return status === 'ordered' || isCancelled;
  });

  // אם כל הפריטים הוכרעו - סמן כמוכן לגביה
  // ⚠️ PHASE 6.5.1: Hook זה משמש כ-FALLBACK בלבד למניעת race conditions
  // העדכון העיקרי מתבצע ב-paymentStatusUpdater.tryMarkPaymentAsReady()
  if (allItemsDecided && this.payment.status === 'hold') {
    console.log(`[Order ${this.orderNumber}] ✅ כל הפריטים הוכרעו - מוכן לגביה (fallback hook)`);
    this.payment.status = 'ready_to_charge';

    // הוסף לטיימליין (internal - payment status)
    this.timeline.push({
      status: 'ready_to_charge',
      message: 'כל הפריטים הוכרעו - מוכן לגביה',
      timestamp: new Date(),
      internal: true
    });
  }

  next();
});

// ✅ NEW: Migration hook - העתק transactionId ישן ל-hypTransactionId
orderSchema.pre('save', function(next) {
  if (this.payment?.transactionId && !this.payment.hypTransactionId) {
    this.payment.hypTransactionId = this.payment.transactionId;
  }
  next();
});

// Update user stats when order is created
orderSchema.post('save', async function(doc) {
  if (doc.isNew && doc.payment.status === 'charged') {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(doc.user, {
      $inc: {
        'stats.totalOrders': 1,
        'stats.totalSpent': doc.pricing.total
      }
    });
  }
});

// ✅ INDEXES FOR PERFORMANCE
// Note: orderNumber already has unique: true in field definition, no need for duplicate index

// Compound index for filtering and sorting
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ user: 1, createdAt: -1 });

// Index for item status queries
orderSchema.index({ 'items.itemStatus': 1 });
orderSchema.index({ 'items.cancellation.cancelled': 1 });

// Index for pricing queries
orderSchema.index({ 'pricing.total': 1 });
orderSchema.index({ 'pricing.adjustedTotal': 1 });

// Index for date range queries
orderSchema.index({ createdAt: -1 });
orderSchema.index({ updatedAt: -1 });

// Index for supplier orders
orderSchema.index({ 'items.supplierOrder.orderedAt': 1 });
orderSchema.index({ 'items.supplierName': 1 });

// Sparse index for tracking numbers
orderSchema.index({ 'shipping.trackingNumber': 1 }, { sparse: true });

// ✅ NEW: Indexes for computed fields
orderSchema.index({ 'computed.overallProgress': 1, createdAt: -1 });
orderSchema.index({ 'computed.needsAttention': 1 });
orderSchema.index({ 'computed.hasActiveItems': 1 });

// ✅ NEW: Index for payment charging
orderSchema.index({ 'payment.status': 1, 'payment.holdAt': 1 });

// ⚡ SCALE FIX: Compound indexes for complex queries
// Query: "הזמנות שצריכות תשומת לב" (orders with alerts)
orderSchema.index({
  'computed.needsAttention': 1,
  'computed.hasActiveItems': 1,
  createdAt: -1
});

// Query: "הזמנות לפי ספק ותאריך" (orders by supplier)
orderSchema.index({
  'items.supplierName': 1,
  'items.itemStatus': 1,
  createdAt: -1
});

// Query: "הזמנות משתמש לפי סטטוס" (user orders by status)
orderSchema.index({
  user: 1,
  status: 1,
  createdAt: -1
});

// Query: "פריטים שממתינים להזמנה" (items waiting to order)
orderSchema.index({
  'items.itemStatus': 1,
  'items.supplierName': 1,
  'items.cancellation.cancelled': 1
});

// ✅ Phase 10: Indexes for refunds
orderSchema.index({ 'refunds.status': 1, 'refunds.createdAt': -1 });
orderSchema.index({ 'refunds.hypRefundId': 1 }, { sparse: true });
orderSchema.index({ 'payment.refundedAmount': 1 });

// ============================================
// ✅ COMPUTED STATUS CALCULATION FUNCTIONS
// ============================================

/**
 * חישוב overall progress מסטטוסים של פריטים
 */
function calculateOverallProgress(order) {
  const activeItems = order.items.filter(item => !item.cancellation?.cancelled);

  // אם אין פריטים פעילים - ההזמנה בוטלה
  if (activeItems.length === 0) return 'cancelled';

  // אם כל הפריטים נמסרו - הושלם
  const allDelivered = activeItems.every(item => item.itemStatus === 'delivered');
  if (allDelivered) return 'completed';

  // אם יש לפחות פריט אחד שהוזמן או בדרך - בתהליך
  const anyInProgress = activeItems.some(item =>
    ['ordered_from_supplier', 'arrived_us_warehouse', 'shipped_to_israel',
     'customs_israel', 'arrived_israel', 'ready_for_delivery', 'in_transit'].includes(item.itemStatus)
  );
  if (anyInProgress) return 'in_progress';

  // אחרת - עדיין ממתין
  return 'pending';
}

/**
 * חישוב אחוז השלמה
 */
function calculateCompletionPercentage(order) {
  const activeItems = order.items.filter(item => !item.cancellation?.cancelled);
  if (activeItems.length === 0) return 100; // אם הכל בוטל - 100%

  const deliveredCount = activeItems.filter(item => item.itemStatus === 'delivered').length;
  return Math.round((deliveredCount / activeItems.length) * 100);
}

/**
 * בדיקה אם צריך תשומת לב
 */
function calculateNeedsAttention(order) {
  const activeItems = order.items.filter(item => !item.cancellation?.cancelled);

  if (activeItems.length === 0) return false;

  // ✅ בדיקה מיוחדת לפריט יחיד - רק אם תקוע
  if (activeItems.length === 1) {
    const singleItem = activeItems[0];

    // אם הפריט delivered או pending - לא צריך תשומת לב
    if (singleItem.itemStatus === 'delivered' || singleItem.itemStatus === 'pending') {
      return false;
    }

    // אם הפריט ordered או in_transit - בדוק אם תקוע
    if (['ordered_from_supplier', 'in_transit'].includes(singleItem.itemStatus)) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const lastUpdate = singleItem.supplierOrder?.lastUpdated ||
                        singleItem.supplierOrder?.orderedAt ||
                        order.createdAt;
      return new Date(lastUpdate) < sevenDaysAgo;
    }

    // אחרת - לא צריך תשומת לב
    return false;
  }

  // הזמנות pending או payment_hold (רק עם 2+ פריטים)
  if (order.status === 'pending' || order.status === 'payment_hold') return true;

  // פריטים תקועים (לא עודכנו ב-7 ימים) - למקרים עם 2+ פריטים
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const hasStuckItems = activeItems.some(item => {
    if (!['ordered_from_supplier', 'in_transit'].includes(item.itemStatus)) return false;

    const lastUpdate = item.supplierOrder?.lastUpdated || item.supplierOrder?.orderedAt || order.createdAt;
    return new Date(lastUpdate) < sevenDaysAgo;
  });

  return hasStuckItems;
}

const Order = mongoose.model('Order', orderSchema);

export default Order;