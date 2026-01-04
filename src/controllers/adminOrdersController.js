// controllers/adminOrdersController.js - Week 5: Orders Management for Admin

import Order from '../models/Order.js';
import User from '../models/User.js';
import OrderStatus from '../models/OrderStatus.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getOrderStatistics } from '../utils/orderStatusCalculation.js';
import { sendDeliveryConfirmation, sendCustomEmail, sendBulkEmails } from '../services/emailService.js';

// @desc    Get all orders with pagination and filters
// @route   GET /api/admin/orders
// @access  Private/Admin
export const getAllOrders = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Build filter object
  const filter = {};

  // Filter by status
  if (req.query.status) {
    filter.status = req.query.status;
  }

  // Filter by payment status
  if (req.query.paymentStatus) {
    filter['payment.status'] = req.query.paymentStatus;
  }

  // Filter by date range
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) {
      filter.createdAt.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      const endDate = new Date(req.query.endDate);
      endDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = endDate;
    }
  }

  // Search by order number, user email, or user name
  if (req.query.search) {
    // ✅ SECURITY: Prevent NoSQL Injection
    if (typeof req.query.search !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid search parameter'
      });
    }

    // Sanitize and limit search term
    const searchTerm = String(req.query.search).trim().substring(0, 100);

    if (searchTerm.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search term cannot be empty'
      });
    }

    // Escape special regex characters
    const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const searchUsers = await User.find({
      $or: [
        { email: { $regex: escapedSearch, $options: 'i' } },
        { firstName: { $regex: escapedSearch, $options: 'i' } },
        { lastName: { $regex: escapedSearch, $options: 'i' } }
      ]
    }).select('_id');

    const userIds = searchUsers.map(u => u._id);

    filter.$or = [
      { orderNumber: { $regex: escapedSearch, $options: 'i' } },
      { user: { $in: userIds } }
    ];
  }

  // Build sort object
  const sortBy = req.query.sortBy || '-createdAt';

  // Execute queries in parallel
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'firstName lastName email phone')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      // ⚡ SCALE FIX: Select only necessary fields for list view (reduce payload size)
      // Old: ~2KB per order × 50 = 100KB
      // New: ~500 bytes per order × 50 = 25KB (75% reduction!)
      .select('orderNumber user status pricing computed createdAt updatedAt')
      .lean(), // Convert to plain JavaScript objects
    Order.countDocuments(filter)
  ]);

  // Ensure _id is a string for each order
  const ordersWithStringIds = orders.map(order => ({
    ...order,
    _id: order._id.toString(),
    user: order.user ? {
      ...order.user,
      _id: order.user._id.toString()
    } : null
  }));

  res.json({
    success: true,
    data: ordersWithStringIds,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalOrders: total,
      hasMore: skip + orders.length < total
    }
  });
});

// @desc    Get single order details
// @route   GET /api/admin/orders/:id
// @access  Private/Admin
export const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'firstName lastName email phone')
    .populate('items.product', 'name_he asin images')
    .populate('items.statusHistory.changedBy', 'firstName lastName email')
    .populate('items.supplierOrder.orderedBy', 'firstName lastName email')
    .populate('items.cancellation.cancelledBy', 'firstName lastName email')
    .lean();

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  // ✅ SECURITY: Removed sensitive debug logging
  // Debug logging can expose sensitive data like supplier links, pricing, etc.

  // Convert IDs to strings
  const orderWithStringIds = {
    ...order,
    _id: order._id.toString(),
    user: order.user ? {
      ...order.user,
      _id: order.user._id.toString()
    } : null,
    items: order.items?.map(item => {
      // שמירת כל השדות של item (כולל supplierLink, supplierName)
      const mappedItem = {
        ...item,
        _id: item._id?.toString()
      };

      // רק אם יש product מ-populate, נעדכן אותו
      if (item.product) {
        mappedItem.product = {
          ...item.product,
          _id: item.product._id.toString()
        };
      }

      return mappedItem;
    }) || []
  };

  // Debug: בואו נראה מה יש אחרי המיפוי
  console.log('✅ Order items after mapping:', orderWithStringIds.items?.map(item => ({
    supplierLink: item.supplierLink,
    supplierName: item.supplierName,
    name: item.name
  })));

  res.json({
    success: true,
    data: orderWithStringIds
  });
});

/**
 * Phase 9.3: Manual status override for order
 * PUT /api/admin/orders/:id/manual-status
 */
export const manualStatusOverride = asyncHandler(async (req, res) => {
  const { status, reason, clearOverride } = req.body;

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  // Clear override
  if (clearOverride) {
    order.manualStatusOverride = false;

    order.timeline.push({
      status: order.status,
      message: `שחרור נעילת סטטוס ראשי להזמנה`,
      timestamp: new Date(),
      internal: true
    });

    await order.save();

    return res.json({
      success: true,
      data: {
        order: {
          id: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          manualOverride: false
        }
      },
      message: 'נעילת הסטטוס הראשי שוחררה - האוטומציה תמשיך לפעול'
    });
  }

  // Lock with new status
  if (!status) {
    return res.status(400).json({
      success: false,
      message: 'נא לספק סטטוס חדש'
    });
  }

  const oldStatus = order.status;
  order.status = status;
  order.manualStatusOverride = true;

  // Add to timeline
  order.timeline.push({
    status: order.status,
    message: `עדכון סטטוס ראשי ידני: ${oldStatus} → ${status}. סיבה: ${reason || 'לא צוינה'}`,
    timestamp: new Date(),
    internal: true
  });

  await order.save();

  res.json({
    success: true,
    data: {
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        previousStatus: oldStatus,
        newStatus: status,
        manualOverride: true
      }
    },
    message: 'סטטוס ההזמנה הראשי עודכן ידנית - האוטומציה לא תדרוס שינוי זה',
    warning: 'שים לב: עדכונים אוטומטיים לא ישפיעו על הזמנה זו עד לשחרור הנעילה'
  });
});

// @desc    Update order status
// @route   PUT /api/admin/orders/:id/status
// @access  Private/Admin
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, message } = req.body;

  // Validate status exists in OrderStatus collection
  const statusExists = await OrderStatus.findOne({
    key: status,
    isActive: true
  });

  if (!statusExists) {
    return res.status(400).json({
      success: false,
      message: 'סטטוס לא תקין או לא פעיל'
    });
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  // Update status
  order.status = status;

  // Add timeline entry (admin status updates are internal by default)
  order.timeline.push({
    status,
    message: message || await getDefaultStatusMessage(status),
    timestamp: Date.now(),
    internal: true
  });

  // Handle credit hold
  if (status === 'payment_hold' && !order.creditHold?.heldAt) {
    order.creditHold = {
      amount: order.pricing.total,
      heldAt: Date.now()
    };
  }

  // Release credit hold when cancelled
  if (status === 'cancelled' && order.creditHold?.heldAt && !order.creditHold?.releasedAt) {
    order.creditHold.releasedAt = Date.now();
  }

  // Update dates based on status
  if (status === 'shipped_to_customer' && !order.shipping.shippedAt) {
    order.shipping.shippedAt = Date.now();
  }

  if (status === 'delivered' && !order.shipping.deliveredAt) {
    order.shipping.deliveredAt = Date.now();
  }

  if (status === 'payment_hold' && order.payment.status === 'pending') {
    order.payment.status = 'completed';
    order.payment.paidAt = Date.now();
  }

  await order.save();

  res.json({
    success: true,
    message: 'סטטוס ההזמנה עודכן בהצלחה',
    data: order
  });
});

// @desc    Update tracking number
// @route   PUT /api/admin/orders/:id/tracking
// @access  Private/Admin
export const updateTracking = asyncHandler(async (req, res) => {
  const { trackingNumber, carrier } = req.body;

  if (!trackingNumber) {
    return res.status(400).json({
      success: false,
      message: 'נא להזין מספר מעקב'
    });
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  order.shipping.trackingNumber = trackingNumber;
  if (carrier) {
    order.shipping.carrier = carrier;
  }

  // If order is in Israel warehouse, update to shipped to customer
  if (order.status === 'arrived_israel_warehouse') {
    order.status = 'shipped_to_customer';
    order.shipping.shippedAt = Date.now();

    order.timeline.push({
      status: 'shipped_to_customer',
      message: `ההזמנה נשלחה! מספר מעקב: ${trackingNumber}`,
      timestamp: Date.now(),
      internal: false
    });
  }

  await order.save();

  res.json({
    success: true,
    message: 'מספר מעקב עודכן בהצלחה',
    data: order
  });
});

// @desc    Add notes to order
// @route   POST /api/admin/orders/:id/notes
// @access  Private/Admin
export const addOrderNotes = asyncHandler(async (req, res) => {
  const { notes } = req.body;

  if (!notes || notes.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'נא להזין הערות'
    });
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  order.notes = notes;
  await order.save();

  res.json({
    success: true,
    message: 'הערות נוספו בהצלחה',
    data: order
  });
});

// @desc    Cancel order
// @route   DELETE /api/admin/orders/:id
// @access  Private/Admin
export const cancelOrder = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  // Can't cancel delivered orders
  if (order.status === 'delivered') {
    return res.status(400).json({
      success: false,
      message: 'לא ניתן לבטל הזמנה שכבר נמסרה'
    });
  }

  order.status = 'cancelled';
  order.timeline.push({
    status: 'cancelled',
    message: 'ההזמנה בוטלה',
    timestamp: Date.now(),
    internal: false
  });
  // Also log the reason internally
  if (reason) {
    order.timeline.push({
      status: 'cancelled',
      message: `סיבת ביטול: ${reason}`,
      timestamp: Date.now(),
      internal: true
    });
  }

  await order.save();

  res.json({
    success: true,
    message: 'ההזמנה בוטלה בהצלחה',
    data: order
  });
});

// @desc    Refresh order items with latest product data
// @route   PATCH /api/admin/orders/:id/refresh-items
// @access  Private/Admin
export const refreshOrderItems = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  // Import Product model
  const Product = (await import('../models/Product.js')).default;

  // עבור כל פריט בהזמנה, עדכן את המידע מהמוצר
  const updatedItems = [];

  for (const item of order.items) {
    const product = await Product.findById(item.product);

    if (!product) {
      // אם המוצר לא נמצא, שמור את הפריט כמו שהוא
      updatedItems.push(item);
      continue;
    }

    let supplierLink = product.links?.supplierUrl || product.links?.amazon || null;

    // אם יש ווריאנט, בדוק אם יש לו לינק ספציפי
    if (item.variantSku) {
      const variant = product.variants?.find(v => v.sku === item.variantSku);
      if (variant?.supplierLink) {
        supplierLink = variant.supplierLink;
      }
    }

    const itemData = item.toJSON();
    itemData.supplierLink = supplierLink;
    itemData.supplierName = product.supplier?.name || 'Amazon';
    updatedItems.push(itemData);
  }

  order.items = updatedItems;
  await order.save();

  res.json({
    success: true,
    message: 'פרטי המוצרים בהזמנה עודכנו',
    data: order
  });
});

// @desc    Get order statistics
// @route   GET /api/admin/orders/stats
// @access  Private/Admin
export const getOrderStats = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Use aggregation for better performance and computed fields
  const stats = await Order.aggregate([
    {
      $facet: {
        // Today's orders
        todayOrders: [
          { $match: { createdAt: { $gte: today } } },
          { $count: 'count' }
        ],

        // By status (legacy field)
        pending: [
          { $match: { status: 'pending' } },
          { $count: 'count' }
        ],
        payment_hold: [
          { $match: { status: 'payment_hold' } },
          { $count: 'count' }
        ],
        ordered: [
          { $match: { status: 'ordered' } },
          { $count: 'count' }
        ],
        arrived_us_warehouse: [
          { $match: { status: 'arrived_us_warehouse' } },
          { $count: 'count' }
        ],
        shipped_to_israel: [
          { $match: { status: 'shipped_to_israel' } },
          { $count: 'count' }
        ],
        customs_israel: [
          { $match: { status: 'customs_israel' } },
          { $count: 'count' }
        ],
        arrived_israel_warehouse: [
          { $match: { status: 'arrived_israel_warehouse' } },
          { $count: 'count' }
        ],
        shipped_to_customer: [
          { $match: { status: 'shipped_to_customer' } },
          { $count: 'count' }
        ],
        delivered: [
          { $match: { status: 'delivered' } },
          { $count: 'count' }
        ],

        // By computed overallProgress (more accurate)
        byOverallProgress: [
          {
            $group: {
              _id: '$computed.overallProgress',
              count: { $sum: 1 }
            }
          }
        ],

        // By payment status
        byPaymentStatus: [
          {
            $group: {
              _id: '$payment.status',
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);

  const result = stats[0];

  // Build breakdown from computed.overallProgress
  const breakdown = result.byOverallProgress.reduce((acc, item) => {
    if (item._id) {
      acc[item._id] = item.count;
    }
    return acc;
  }, {});

  // Build payment status breakdown
  const byPaymentStatus = result.byPaymentStatus.reduce((acc, item) => {
    if (item._id) {
      acc[item._id] = item.count;
    }
    return acc;
  }, {});

  res.json({
    success: true,
    data: {
      today: result.todayOrders[0]?.count || 0,
      pending: result.pending[0]?.count || 0,
      payment_hold: result.payment_hold[0]?.count || 0,
      ordered: result.ordered[0]?.count || 0,
      arrived_us_warehouse: result.arrived_us_warehouse[0]?.count || 0,
      shipped_to_israel: result.shipped_to_israel[0]?.count || 0,
      customs_israel: result.customs_israel[0]?.count || 0,
      arrived_israel_warehouse: result.arrived_israel_warehouse[0]?.count || 0,
      shipped_to_customer: result.shipped_to_customer[0]?.count || 0,
      delivered: result.delivered[0]?.count || 0,
      breakdown,
      byPaymentStatus
    }
  });
});

// Helper function for default status messages
async function getDefaultStatusMessage(status) {
  // Try to get message from OrderStatus collection
  const statusObj = await OrderStatus.findOne({ key: status });

  if (statusObj && statusObj.description) {
    return statusObj.description;
  }

  // Fallback messages
  const messages = {
    pending: 'ההזמנה התקבלה וממתינה לאישור',
    payment_hold: 'מסגרת אשראי נעולה בהצלחה',
    ordered: 'ההזמנה בוצעה מארה"ב',
    cancelled: 'ההזמנה בוטלה',
    arrived_us_warehouse: 'ההזמנה הגיעה למרכז הלוגיסטי בארה"ב',
    shipped_to_israel: 'ההזמנה נשלחה לישראל',
    customs_israel: 'ההזמנה הגיעה למכס בישראל',
    arrived_israel_warehouse: 'ההזמנה הגיעה למרכז הלוגיסטי בישראל',
    shipped_to_customer: 'ההזמנה נשלחה אליך',
    delivered: 'ההזמנה נמסרה ללקוח'
  };

  return messages[status] || `סטטוס עודכן ל-${status}`;
}

// @desc    Get detailed statistics for a specific order
// @route   GET /api/admin/orders/:id/statistics
// @access  Private/Admin
export const getOrderDetailedStats = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  const statistics = getOrderStatistics(order);

  res.json({
    success: true,
    data: statistics
  });
});

// @desc    Get all orders with alerts
// @route   GET /api/admin/orders/alerts
// @access  Private/Admin
export const getOrdersWithAlerts = asyncHandler(async (req, res) => {
  // ⚡ SCALE FIX: Use computed fields instead of heavy aggregation
  // Old: 6-stage aggregation recalculating everything (5-10s with 5000 orders)
  // New: Simple query using pre-computed fields (50-100ms)

  const ordersWithAlerts = await Order.find({
    // ✅ Use computed fields from pre-save hooks
    'computed.needsAttention': true,
    'computed.hasActiveItems': true,
    // ✅ Exclude fully cancelled/delivered orders
    status: { $nin: ['cancelled', 'delivered'] }
  })
    .populate('user', 'firstName lastName email')
    .populate('items.product', 'name_he asin')
    .select('orderNumber user status items computed pricing createdAt')
    .sort('-createdAt')
    .limit(100)
    .lean(); // ⚡ Convert to plain objects for performance

  // ✅ Format response with statistics
  const formattedOrders = ordersWithAlerts.map(order => {
    const statistics = getOrderStatistics(order);

    // ✅ Double-check: only include orders with active non-delivered items
    const hasActiveNonDeliveredItems = order.items.some(item =>
      !item.cancellation?.cancelled &&
      item.itemStatus !== 'delivered'
    );

    if (!hasActiveNonDeliveredItems) {
      return null;
    }

    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      user: order.user,
      createdAt: order.createdAt,
      statistics,
      alerts: statistics.stuckOrders.alerts
    };
  }).filter(Boolean); // Remove nulls

  res.json({
    success: true,
    data: {
      ordersWithAlerts: formattedOrders.length,
      orders: formattedOrders
    }
  });
});

// @desc    Get item-level statistics across all orders
// @route   GET /api/admin/orders/items/statistics
// @access  Private/Admin
export const getItemStatistics = asyncHandler(async (req, res) => {
  const orders = await Order.find().lean();

  const stats = {
    totalItems: 0,
    activeItems: 0,
    cancelledItems: 0,
    statusCounts: {},
    stuckItems: 0
  };

  orders.forEach(order => {
    const orderStats = getOrderStatistics(order);

    stats.totalItems += orderStats.totalItemsCount;
    stats.activeItems += orderStats.activeItemsCount;
    stats.cancelledItems += orderStats.cancelledItemsCount;
    stats.stuckItems += orderStats.stuckOrders.stuckItemsCount;

    // Aggregate status counts
    Object.entries(orderStats.statusCounts).forEach(([status, count]) => {
      stats.statusCounts[status] = (stats.statusCounts[status] || 0) + count;
    });
  });

  res.json({
    success: true,
    data: stats
  });
});

// @desc    Get KPIs for dashboard
// @route   GET /api/admin/orders/kpis
// @access  Private/Admin
export const getOrdersKPIs = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // ✅ NEW: Use computed fields for much faster queries!
  const kpis = await Order.aggregate([
    {
      $facet: {
        // דחופות - צריכות תשומת לב
        urgent: [
          {
            $match: {
              'computed.needsAttention': true,
              'computed.overallProgress': { $nin: ['completed', 'cancelled'] }
            }
          },
          { $count: 'count' }
        ],

        // דחופות שנוספו היום
        urgentToday: [
          {
            $match: {
              createdAt: { $gte: today },
              'computed.needsAttention': true
            }
          },
          { $count: 'count' }
        ],

        // בדרך
        inTransit: [
          {
            $match: {
              'items.itemStatus': 'in_transit',
              'items.cancellation.cancelled': { $ne: true },
              'computed.overallProgress': { $nin: ['cancelled', 'completed'] }
            }
          },
          { $count: 'count' }
        ],

        // תקועות - צריכות תשומת לב
        stuck: [
          {
            $match: {
              'computed.needsAttention': true,
              'computed.hasActiveItems': true,
              'computed.overallProgress': 'in_progress'
            }
          },
          { $count: 'count' }
        ],

        // הושלמו היום
        completedToday: [
          {
            $match: {
              'computed.overallProgress': 'completed',
              updatedAt: { $gte: today }
            }
          },
          { $count: 'count' }
        ],

        // הכנסות היום (הזמנות שהושלמו)
        revenueToday: [
          {
            $match: {
              'computed.overallProgress': 'completed',
              updatedAt: { $gte: today }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$pricing.adjustedTotal' }
            }
          }
        ],

        // ממתין לתשלום - מוכן לגבייה
        pendingPayment: [
          {
            $match: {
              'payment.status': { $in: ['pending', 'hold', 'ready_to_charge', 'retry_pending'] },
              'computed.overallProgress': { $nin: ['cancelled'] }
            }
          },
          { $count: 'count' }
        ],

        // סכום ממתין לגבייה
        pendingPaymentAmount: [
          {
            $match: {
              'payment.status': { $in: ['pending', 'hold', 'ready_to_charge', 'retry_pending'] },
              'computed.overallProgress': { $nin: ['cancelled'] }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ['$pricing.adjustedTotal', '$pricing.total'] } }
            }
          }
        ],

        // הכנסות החודש (הזמנות שנגבו)
        revenueThisMonth: [
          {
            $match: {
              'payment.status': 'charged',
              'payment.chargedAt': { $gte: new Date(today.getFullYear(), today.getMonth(), 1) }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ['$payment.chargedAmount', '$pricing.adjustedTotal'] } }
            }
          }
        ]
      }
    }
  ]);

  const result = kpis[0];

  res.json({
    success: true,
    data: {
      urgent: result.urgent[0]?.count || 0,
      urgentToday: result.urgentToday[0]?.count || 0,
      inTransit: result.inTransit[0]?.count || 0,
      stuck: result.stuck[0]?.count || 0,
      stuckAvgDays: 8,
      completedToday: result.completedToday[0]?.count || 0,
      revenueToday: result.revenueToday[0]?.total || 0,
      pendingPayment: result.pendingPayment[0]?.count || 0,
      pendingPaymentAmount: result.pendingPaymentAmount[0]?.total || 0,
      revenueThisMonth: result.revenueThisMonth[0]?.total || 0
    }
  });
});

// @desc    Get filtered orders for dashboard
// @route   GET /api/admin/orders/filtered
// @access  Private/Admin
export const getOrdersFiltered = asyncHandler(async (req, res) => {
  const { filter = 'all' } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ✅ SEARCH: Handle search parameter first
  let searchCondition = null;

  if (req.query.search) {
    // SECURITY: Prevent NoSQL Injection
    if (typeof req.query.search !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid search parameter'
      });
    }

    // Sanitize and limit search term
    const searchTerm = String(req.query.search).trim().substring(0, 100);

    if (searchTerm.length > 0) {
      // Escape special regex characters
      const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Find users matching the search
      const searchUsers = await User.find({
        $or: [
          { email: { $regex: escapedSearch, $options: 'i' } },
          { firstName: { $regex: escapedSearch, $options: 'i' } },
          { lastName: { $regex: escapedSearch, $options: 'i' } }
        ]
      }).select('_id');

      const userIds = searchUsers.map(u => u._id);

      // Build search condition
      searchCondition = {
        $or: [
          { orderNumber: { $regex: escapedSearch, $options: 'i' } },
          { user: { $in: userIds } }
        ]
      };
    }
  }

  // ✅ Build filter based on selection
  let filterCondition = {};

  switch (filter) {
    case 'urgent':
      // דחופות - צריכות תשומת לב
      filterCondition = {
        'computed.needsAttention': true,
        'computed.overallProgress': { $nin: ['completed', 'cancelled'] }
      };
      break;

    case 'stuck':
      // תקועות - צריכות תשומת לב ויש פריטים פעילים
      filterCondition = {
        'computed.needsAttention': true,
        'computed.hasActiveItems': true,
        'computed.overallProgress': { $nin: ['completed', 'cancelled'] }
      };
      break;

    case 'cancelled_today':
      // בוטלו היום
      filterCondition = {
        'computed.overallProgress': 'cancelled',
        updatedAt: { $gte: today }
      };
      break;

    case 'needs_tracking':
      // צריך מספר מעקב
      filterCondition = {
        'items.itemStatus': 'in_transit',
        'items.supplierOrder.trackingNumber': { $in: ['', null] },
        'items.cancellation.cancelled': { $ne: true },
        'computed.overallProgress': { $nin: ['cancelled', 'completed'] }
      };
      break;

    case 'in_transit':
      // במשלוח
      filterCondition = {
        'items.itemStatus': 'in_transit',
        'items.cancellation.cancelled': { $ne: true },
        'computed.overallProgress': { $nin: ['cancelled', 'completed'] }
      };
      break;

    case 'pending_payment':
      // ממתין לתשלום
      filterCondition = {
        'payment.status': { $in: ['pending', 'ready', 'retry_pending'] },
        'computed.overallProgress': { $nin: ['cancelled'] }
      };
      break;

    case 'completed_today':
      // הושלמו היום
      filterCondition = {
        'computed.overallProgress': 'completed',
        updatedAt: { $gte: today }
      };
      break;

    case 'all':
    default:
      // הכל - רק לא מבוטלות
      filterCondition = {
        'computed.overallProgress': { $nin: ['cancelled'] }
      };
      break;
  }

  // ✅ Phase 11: Advanced Filters
  let advancedConditions = [];

  // Payment Status Filter
  if (req.query.paymentStatus && req.query.paymentStatus !== 'all') {
    advancedConditions.push({
      'payment.status': req.query.paymentStatus
    });
  }

  // Item Status Filter
  if (req.query.itemStatus && req.query.itemStatus !== 'all') {
    advancedConditions.push({
      'items.itemStatus': req.query.itemStatus,
      'items.cancellation.cancelled': { $ne: true }
    });
  }

  // Date Range Filter
  if (req.query.dateFrom || req.query.dateTo) {
    const dateCondition = {};
    if (req.query.dateFrom) {
      dateCondition.$gte = new Date(req.query.dateFrom);
    }
    if (req.query.dateTo) {
      const dateTo = new Date(req.query.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      dateCondition.$lte = dateTo;
    }
    advancedConditions.push({ createdAt: dateCondition });
  }

  // ✅ Combine search, filter, and advanced conditions
  let matchStage = {};
  let allConditions = [filterCondition];

  if (searchCondition) {
    allConditions.push(searchCondition);
  }

  if (advancedConditions.length > 0) {
    allConditions = allConditions.concat(advancedConditions);
  }

  if (allConditions.length > 1) {
    matchStage = { $and: allConditions };
  } else {
    matchStage = filterCondition;
  }

  const orders = await Order.find(matchStage)
    .populate('user', 'firstName lastName email phone')
    .populate('items.product', 'name_he asin')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Order.countDocuments(matchStage);

  // חישוב statistics לכל הזמנה
  const ordersWithStats = orders.map(order => ({
    ...order,
    statistics: getOrderStatistics(order)
  }));

  res.json({
    success: true,
    data: {
      orders: ordersWithStats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Get items grouped by supplier (for bulk ordering)
// @route   GET /api/admin/orders/items/by-supplier
// @access  Private/Admin
export const getItemsGroupedBySupplier = asyncHandler(async (req, res) => {
  const grouped = await Order.aggregate([
    // רק הזמנות פעילות
    {
      $match: {
        status: { $nin: ['cancelled', 'delivered'] }
      }
    },

    // פרוש פריטים
    {
      $unwind: '$items'
    },

    // רק פריטים שטרם הוזמנו מספק
    {
      $match: {
        'items.itemStatus': 'pending',
        'items.cancellation.cancelled': { $ne: true },
        'items.supplierName': { $exists: true, $ne: '' }
      }
    },

    // הוסף פרטי משתמש
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails'
      }
    },

    {
      $unwind: '$userDetails'
    },

    // קבץ לפי ספק
    {
      $group: {
        _id: '$items.supplierName',
        totalItems: { $sum: 1 },
        totalCost: { $sum: '$items.price' },
        items: {
          $push: {
            orderId: '$_id',
            orderNumber: '$orderNumber',
            itemId: '$items._id',
            itemName: '$items.name',
            quantity: '$items.quantity',
            price: '$items.price',
            productId: '$items.product',
            variantSku: '$items.variantSku',
            variantDetails: '$items.variantDetails',
            productUrl: '$items.productUrl',
            supplierLink: '$items.supplierLink',
            image: '$items.image',
            customer: {
              name: {
                $concat: ['$userDetails.firstName', ' ', '$userDetails.lastName']
              },
              phone: '$userDetails.phone',
              email: '$userDetails.email'
            }
          }
        }
      }
    },

    // מיון לפי כמות פריטים
    {
      $sort: { totalItems: -1 }
    },

    // עיצוב תוצאה
    {
      $project: {
        _id: 0,
        supplierName: '$_id',
        totalItems: 1,
        totalCost: 1,
        items: 1
      }
    }
  ]);

  res.json({
    success: true,
    data: grouped
  });
});

// @desc    Phase 11: Bulk update order items status
// @route   POST /api/admin/orders/bulk-update-status
// @access  Private/Admin
export const bulkUpdateOrderStatus = asyncHandler(async (req, res) => {
  const { orderIds, status } = req.body;

  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'יש לספק רשימת הזמנות'
    });
  }

  if (!status) {
    return res.status(400).json({
      success: false,
      message: 'יש לספק סטטוס חדש'
    });
  }

  const validStatuses = ['pending', 'ordered', 'shipped', 'in_transit', 'delivered'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'סטטוס לא תקין'
    });
  }

  // Map status to itemStatus
  const itemStatusMap = {
    'ordered': 'ordered',
    'shipped': 'shipped',
    'in_transit': 'in_transit',
    'delivered': 'delivered'
  };

  const itemStatus = itemStatusMap[status] || status;

  let updated = 0;
  let errors = [];

  for (const orderId of orderIds) {
    try {
      const order = await Order.findById(orderId);

      if (!order) {
        errors.push({ orderId, error: 'הזמנה לא נמצאה' });
        continue;
      }

      // Update all non-cancelled items
      let itemsUpdated = 0;
      for (const item of order.items) {
        if (!item.cancellation?.cancelled) {
          item.itemStatus = itemStatus;
          itemsUpdated++;
        }
      }

      // Add timeline entry
      order.timeline.push({
        status: `bulk_update_${status}`,
        message: `עדכון גורף: ${itemsUpdated} פריטים עודכנו ל-${status}`,
        timestamp: new Date(),
        internal: true
      });

      await order.save();
      updated++;
    } catch (error) {
      errors.push({ orderId, error: error.message });
    }
  }

  res.json({
    success: true,
    message: `${updated} הזמנות עודכנו בהצלחה`,
    updated,
    errors: errors.length > 0 ? errors : undefined
  });
});

// @desc    Send delivery confirmation email
// @route   POST /api/admin/orders/:id/send-delivery-email
// @access  Private/Admin
export const sendDeliveryEmail = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'email firstName lastName');

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  // Update delivery date if not set
  if (!order.shipping.deliveredAt) {
    order.shipping.deliveredAt = new Date();
    await order.save();
  }

  const result = await sendDeliveryConfirmation(order);

  if (result.success) {
    // Log email sent in timeline
    order.timeline.push({
      status: 'email_sent',
      message: 'מייל אישור מסירה נשלח ללקוח',
      timestamp: new Date(),
      internal: true
    });
    await order.save();

    res.json({
      success: true,
      message: 'מייל אישור מסירה נשלח בהצלחה',
      data: { messageId: result.messageId }
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'שגיאה בשליחת מייל',
      error: result.error
    });
  }
});

// @desc    Send custom email to customer
// @route   POST /api/admin/orders/:id/send-custom-email
// @access  Private/Admin
export const sendCustomEmailToCustomer = asyncHandler(async (req, res) => {
  const { subject, body, includeOrderContext } = req.body;

  if (!subject || !body) {
    return res.status(400).json({
      success: false,
      message: 'נדרש נושא ותוכן למייל'
    });
  }

  const order = await Order.findById(req.params.id)
    .populate('user', 'email firstName lastName');

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  const email = order.shippingAddress?.email || order.user?.email;
  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'אין כתובת מייל ללקוח'
    });
  }

  const result = await sendCustomEmail(
    email,
    subject,
    body,
    includeOrderContext ? order : null
  );

  if (result.success) {
    // Log email sent in timeline
    order.timeline.push({
      status: 'email_sent',
      message: `מייל נשלח ללקוח: ${subject}`,
      timestamp: new Date(),
      internal: true
    });
    await order.save();

    res.json({
      success: true,
      message: 'מייל נשלח בהצלחה',
      data: { messageId: result.messageId }
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'שגיאה בשליחת מייל',
      error: result.error
    });
  }
});

// @desc    Get all customers for email sending
// @route   GET /api/admin/email/customers
// @access  Private/Admin
export const getCustomersForEmail = asyncHandler(async (req, res) => {
  const { search } = req.query;

  let query = { accountStatus: 'active' };

  if (search) {
    const escapedSearch = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { email: { $regex: escapedSearch, $options: 'i' } },
      { firstName: { $regex: escapedSearch, $options: 'i' } },
      { lastName: { $regex: escapedSearch, $options: 'i' } }
    ];
  }

  const customers = await User.find(query)
    .select('email firstName lastName')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({
    success: true,
    data: customers
  });
});

// @desc    Send bulk email to multiple customers
// @route   POST /api/admin/email/send-bulk
// @access  Private/Admin
export const sendBulkEmailToCustomers = asyncHandler(async (req, res) => {
  const { recipients, subject, body, orderId } = req.body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'נדרשים נמענים'
    });
  }

  if (!subject || !body) {
    return res.status(400).json({
      success: false,
      message: 'נדרש נושא ותוכן למייל'
    });
  }

  // Get order if specified
  let order = null;
  if (orderId) {
    order = await Order.findById(orderId);
  }

  const results = await sendBulkEmails(recipients, subject, body, order);

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;

  res.json({
    success: true,
    message: `${successCount} מיילים נשלחו בהצלחה, ${failedCount} נכשלו`,
    data: {
      sent: successCount,
      failed: failedCount,
      results
    }
  });
});

// @desc    Send email to external address (not in system)
// @route   POST /api/admin/email/send-external
// @access  Private/Admin
export const sendExternalEmail = asyncHandler(async (req, res) => {
  const { email, subject, body, orderId } = req.body;

  if (!email || !subject || !body) {
    return res.status(400).json({
      success: false,
      message: 'נדרש כתובת מייל, נושא ותוכן'
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'כתובת מייל לא תקינה'
    });
  }

  // Get order if specified
  let order = null;
  if (orderId) {
    order = await Order.findById(orderId);
  }

  const result = await sendCustomEmail(email, subject, body, order);

  if (result.success) {
    res.json({
      success: true,
      message: 'מייל נשלח בהצלחה',
      data: { messageId: result.messageId }
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'שגיאה בשליחת מייל',
      error: result.error
    });
  }
});

export default {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  updateTracking,
  addOrderNotes,
  cancelOrder,
  getOrderStats,
  getOrderDetailedStats,
  getOrdersWithAlerts,
  getItemStatistics,
  refreshOrderItems,
  getOrdersKPIs,
  getOrdersFiltered,
  getItemsGroupedBySupplier,
  bulkUpdateOrderStatus,
  // Email functions
  sendDeliveryEmail,
  sendCustomEmailToCustomer,
  getCustomersForEmail,
  sendBulkEmailToCustomers,
  sendExternalEmail
};
