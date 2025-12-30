// controllers/orderController.js - Enhanced for Week 4

import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import SystemSettings from '../models/SystemSettings.js';

// @desc    Get my orders with filtering and pagination
// @route   GET /api/orders/my-orders
// @access  Private
export const getMyOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = '-createdAt'
    } = req.query;
    
    // Build query
    const query = { user: req.user.id };
    
    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Get orders with pagination
    const orders = await Order.find(query)
      .populate('items.product', 'name_he imageUrl price')
      .populate('shippingAddress')
      .sort(sortBy)
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    // Get total count for pagination
    const total = await Order.countDocuments(query);
    
    res.json({
      success: true,
      data: orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת ההזמנות'
    });
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id
    })
      .populate('items.product', 'name_he imageUrl price asin')
      .populate('shippingAddress');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    // ✅ SECURITY: Removed debug logging to prevent data exposure

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת ההזמנה'
    });
  }
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
export const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;

    // Validation
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'העגלה ריקה'
      });
    }

    if (!shippingAddress) {
      return res.status(400).json({
        success: false,
        message: 'כתובת משלוח נדרשת'
      });
    }

    // ✅ FIX N+1: טען את כל המוצרים בשאילתה אחת
    const productIds = items.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    // Validate and calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = productMap.get(item.product.toString());

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `מוצר ${item.product} לא נמצא`
        });
      }

      let itemPrice = product.price.ils;
      let variantDetails = null;
      let supplierLink = product.links?.supplierUrl || product.links?.amazon || null;
      let imageUrl = '';

      // בדיקת ווריאנט אם קיים
      if (item.variantSku) {
        const variant = product.variants?.find(v => v.sku === item.variantSku);

        if (!variant) {
          return res.status(404).json({
            success: false,
            message: `ווריאנט ${item.variantSku} לא נמצא במוצר ${product.name_he}`
          });
        }

        if (!variant.stock.available) {
          return res.status(400).json({
            success: false,
            message: `ווריאנט ${variant.color || ''} ${variant.size || ''} של ${product.name_he} אינו זמין במלאי`
          });
        }

        // הוסף עלות נוספת של הווריאנט
        itemPrice += (variant.additionalCost?.ils || 0);

        variantDetails = {
          color: variant.color,
          size: variant.size,
          sku: variant.sku
        };

        // קישור ספציפי לווריאנט (אם קיים)
        if (variant.supplierLink) {
          supplierLink = variant.supplierLink;
        }

        // תמונה ראשית של הווריאנט
        const variantPrimaryImage = variant.images?.find(img => img.isPrimary);
        imageUrl = variantPrimaryImage?.url || variant.images?.[0]?.url || '';
      }

      // אם אין תמונה מהווריאנט, קח תמונה מהמוצר הכללי
      if (!imageUrl) {
        const primaryImage = product.images?.find(img => img.isPrimary);
        imageUrl = primaryImage?.url || product.images?.[0]?.url || '';
      }

      // בדיקת זמינות כללית (אם אין ווריאנט)
      if (!item.variantSku && !product.stock.available) {
        return res.status(400).json({
          success: false,
          message: `מוצר ${product.name_he} אינו זמין במלאי`
        });
      }

      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        variantSku: item.variantSku || null,
        variantDetails: variantDetails,
        name: product.name_he,
        quantity: item.quantity,
        price: itemPrice,
        image: imageUrl,
        asin: product.asin || null,
        supplierLink: supplierLink,
        supplierName: product.supplier?.name || 'Amazon'
      });
    }

    // ✅ FIX: חישוב משלוח דינמי מהגדרות המערכת
    let shippingCost = 49; // Default fallback
    let estimatedDays = 14; // Default fallback
    let freeShippingApplied = false;

    try {
      const settings = await SystemSettings.getSettings();
      shippingCost = settings.shipping.flatRate.ils;
      estimatedDays = settings.shipping.estimatedDays;

      // Check if free shipping applies
      if (settings.shipping.freeShipping?.enabled &&
          settings.shipping.freeShipping?.threshold?.ils > 0 &&
          subtotal >= settings.shipping.freeShipping.threshold.ils) {
        shippingCost = 0;
        freeShippingApplied = true;
        console.log(`✅ Free shipping applied! Subtotal ₪${subtotal} >= threshold ₪${settings.shipping.freeShipping.threshold.ils}`);
      }
    } catch (settingsError) {
      console.error('Error loading system settings, using defaults:', settingsError);
      // Continue with default values
    }

    // Calculate tax (המחירים כוללים מע"מ, זה רק לצורך הצגה)
    const taxRate = 0.18;
    const tax = subtotal * (taxRate / (1 + taxRate));

    // Calculate total (מחיר כבר כולל מע"מ, מוסיפים משלוח)
    const totalAmount = subtotal + shippingCost;

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // ✅ Create Pre-Auth Order with TTL (30 minutes)
    const THIRTY_MINUTES = 30 * 60 * 1000;
    const order = await Order.create({
      user: req.user.id,
      orderNumber,
      items: orderItems,
      shippingAddress,
      pricing: {
        subtotal,
        shipping: shippingCost,
        tax,
        total: totalAmount
      },
      shipping: {
        estimatedDays: estimatedDays,
        method: 'flat_rate'
      },
      status: 'awaiting_payment',  // ✅ סטטוס זמני
      expiresAt: new Date(Date.now() + THIRTY_MINUTES)  // ✅ פג תוקף אחרי 30 דקות
    });

    console.log(`📦 Pre-auth order created: ${order.orderNumber}`, {
      _id: order._id,
      status: order.status,
      expiresAt: order.expiresAt?.toLocaleString('he-IL'),
      createdAt: order.createdAt,
      timeline: order.timeline
    });

    // ❌ DON'T clear cart here - only after successful payment!
    // await Cart.findOneAndDelete({ user: req.user.id });

    // Populate order before sending
    const populatedOrder = await Order.findById(order._id)
      .populate('items.product', 'name_he images price');

    // ✅ SECURITY: Removed debug logging to prevent data exposure

    res.status(201).json({
      success: true,
      data: populatedOrder,
      message: 'ההזמנה נוצרה בהצלחה'
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה ביצירת הזמנה'
    });
  }
};

// @desc    Update order status (Admin only)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
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

    order.status = status;
    
    // Update delivery date if delivered
    if (status === 'delivered') {
      order.deliveredAt = Date.now();
    }

    await order.save();

    res.json({
      success: true,
      data: order,
      message: 'סטטוס ההזמנה עודכן'
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון סטטוס הזמנה'
    });
  }
};

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    // Check if order can be cancelled - only before it's ordered from US
    const cancelableStatuses = ['pending', 'payment_hold'];
    if (!cancelableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'לא ניתן לבטל הזמנה זו - ההזמנה כבר בוצעה'
      });
    }

    order.status = 'cancelled';

    // Release credit hold if exists
    if (order.creditHold?.heldAt && !order.creditHold?.releasedAt) {
      order.creditHold.releasedAt = Date.now();
    }

    // Add timeline entry
    order.timeline.push({
      status: 'cancelled',
      message: 'ההזמנה בוטלה על ידי הלקוח',
      timestamp: Date.now()
    });

    await order.save();

    res.json({
      success: true,
      data: order,
      message: 'ההזמנה בוטלה בהצלחה'
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בביטול הזמנה'
    });
  }
};

// @desc    Get order statistics
// @route   GET /api/orders/stats
// @access  Private
export const getOrderStats = async (req, res) => {
  try {
    const stats = await Order.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    const totalOrders = await Order.countDocuments({ user: req.user.id });
    const totalSpent = await Order.aggregate([
      { $match: { user: req.user._id, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        totalSpent: totalSpent[0]?.total || 0,
        byStatus: stats
      }
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת סטטיסטיקות'
    });
  }
};