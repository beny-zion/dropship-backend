// controllers/adminOrdersController.js - Week 5: Orders Management for Admin

import Order from '../models/Order.js';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';

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
    const searchUsers = await User.find({
      $or: [
        { email: { $regex: req.query.search, $options: 'i' } },
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } }
      ]
    }).select('_id');

    const userIds = searchUsers.map(u => u._id);

    filter.$or = [
      { orderNumber: { $regex: req.query.search, $options: 'i' } },
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
      .select('-__v')
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
    .lean();

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'הזמנה לא נמצאה'
    });
  }

  // Debug: בואו נראה מה יש ב-order.items לפני המיפוי
  console.log('🔍 Order items before mapping:', order.items?.map(item => ({
    supplierLink: item.supplierLink,
    supplierName: item.supplierName,
    name: item.name
  })));

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

// @desc    Update order status
// @route   PUT /api/admin/orders/:id/status
// @access  Private/Admin
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, message } = req.body;

  const validStatuses = [
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled'
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'סטטוס לא תקין'
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

  // Add timeline entry
  order.timeline.push({
    status,
    message: message || getDefaultStatusMessage(status),
    timestamp: Date.now()
  });

  // Update dates based on status
  if (status === 'shipped' && !order.shipping.shippedAt) {
    order.shipping.shippedAt = Date.now();
  }

  if (status === 'delivered' && !order.shipping.deliveredAt) {
    order.shipping.deliveredAt = Date.now();
  }

  if (status === 'confirmed' && order.payment.status === 'pending') {
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

  // If order is not yet shipped, update status
  if (order.status === 'confirmed' || order.status === 'processing') {
    order.status = 'shipped';
    order.shipping.shippedAt = Date.now();
    
    order.timeline.push({
      status: 'shipped',
      message: `ההזמנה נשלחה. מספר מעקב: ${trackingNumber}`,
      timestamp: Date.now()
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
    message: reason || 'ההזמנה בוטלה על ידי המערכת',
    timestamp: Date.now()
  });

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

    updatedItems.push({
      ...item.toObject(),
      supplierLink: supplierLink,
      supplierName: product.supplier?.name || 'Amazon'
    });
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

  const [
    todayOrders,
    pendingOrders,
    processingOrders,
    shippedOrders,
    statusBreakdown
  ] = await Promise.all([
    // Today's orders
    Order.countDocuments({ createdAt: { $gte: today } }),
    
    // Pending orders
    Order.countDocuments({ status: 'pending' }),
    
    // Processing orders
    Order.countDocuments({ status: 'processing' }),
    
    // Shipped orders (not delivered yet)
    Order.countDocuments({ status: 'shipped' }),
    
    // Status breakdown
    Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  res.json({
    success: true,
    data: {
      today: todayOrders,
      pending: pendingOrders,
      processing: processingOrders,
      shipped: shippedOrders,
      breakdown: statusBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    }
  });
});

// Helper function for default status messages
function getDefaultStatusMessage(status) {
  const messages = {
    pending: 'ההזמנה התקבלה וממתינה לאישור',
    confirmed: 'ההזמנה אושרה ונמצאת בהכנה',
    processing: 'ההזמנה בהכנה למשלוח',
    shipped: 'ההזמנה נשלחה',
    delivered: 'ההזמנה נמסרה ללקוח',
    cancelled: 'ההזמנה בוטלה'
  };

  return messages[status] || `סטטוס עודכן ל-${status}`;
}

export default {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  updateTracking,
  addOrderNotes,
  cancelOrder,
  getOrderStats
};
