import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import { generateOrderNumber } from '../utils/orderNumber.js';

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
export const createOrder = async (req, res) => {
  try {
    const { shippingAddress, paymentMethod = 'credit_card', expectedTotal } = req.body;

    // ⭐ Get cart from DB (not from client!)
    const cart = await Cart.findOne({ user: req.user.id }).populate('items.product');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'העגלה ריקה'
      });
    }

    // Validate shipping address
    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.street || !shippingAddress.city) {
      return res.status(400).json({
        success: false,
        message: 'פרטי משלוח חסרים'
      });
    }

    // ⭐ Validate ALL products from DB & calculate pricing
    let subtotal = 0;
    const orderItems = [];
    const unavailableProducts = [];

    for (const item of cart.items) {
      // Fetch fresh product data from DB
      const product = await Product.findById(item.product);

      if (!product) {
        unavailableProducts.push(`מוצר ${item.product} לא נמצא`);
        continue;
      }

      if (product.status !== 'active') {
        unavailableProducts.push(`${product.name_he} - לא זמין`);
        continue;
      }

      // ⭐ תיקון: stock.available
      if (!product.stock.available) {
        unavailableProducts.push(`${product.name_he} - אזל מהמלאי`);
        continue;
      }

      // Check quantity
      if (product.stock.quantity && product.stock.quantity < item.quantity) {
        unavailableProducts.push(`${product.name_he} - נותרו רק ${product.stock.quantity} יחידות`);
        continue;
      }

      // ⭐ Use REAL price from DB!
      const actualPrice = product.price.ils;

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: actualPrice, // ⭐ מחיר אמיתי מה-DB
        name: product.name_he,
        image: product.images[0]?.url || product.images.main,
        asin: product.asin
      });

      subtotal += actualPrice * item.quantity;
    }

    // If any products unavailable, return error
    if (unavailableProducts.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'חלק מהמוצרים לא זמינים',
        unavailableProducts
      });
    }

    if (orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'אין מוצרים זמינים להזמנה'
      });
    }

    // Calculate tax and shipping
    const taxRate = parseFloat(process.env.TAX_RATE) || 0.17;
    const tax = subtotal * taxRate;

    const freeShippingThreshold = parseFloat(process.env.FREE_SHIPPING_THRESHOLD) || 200;
    const standardShippingCost = parseFloat(process.env.STANDARD_SHIPPING_COST) || 30;
    const shipping = subtotal >= freeShippingThreshold ? 0 : standardShippingCost;

    const total = subtotal + tax + shipping;

    // ⭐ Price verification - check if client's expected price matches actual price
    if (expectedTotal && Math.abs(total - expectedTotal) > 0.01) {
      return res.status(409).json({
        success: false,
        message: 'המחיר השתנה מאז הוספת המוצרים לעגלה',
        code: 'PRICE_CHANGED',
        pricing: {
          expected: expectedTotal,
          actual: total,
          difference: total - expectedTotal,
          breakdown: {
            subtotal,
            tax,
            shipping,
            total
          }
        }
      });
    }

    // Generate order number
    const orderNumber = await generateOrderNumber();

    // Create order
    const order = await Order.create({
      orderNumber,
      user: req.user.id,
      items: orderItems,
      shippingAddress,
      pricing: {
        subtotal,
        tax,
        shipping,
        total
      },
      payment: {
        method: paymentMethod,
        status: 'pending'
      },
      shipping: {
        method: 'standard',
        estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    // Clear user's cart
    await Cart.findOneAndUpdate(
      { user: req.user.id },
      { $set: { items: [] } }
    );

    // Update product statistics
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { 'stats.sales': item.quantity }
      });
    }

    await order.populate('items.product');

    res.status(201).json({
      success: true,
      message: 'ההזמנה נוצרה בהצלחה',
      data: order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה ביצירת הזמנה',
      error: error.message
    });
  }
};

// @desc    Get user orders
// @route   GET /api/orders/my-orders
// @access  Private
export const getMyOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip)
            .populate('items.product', 'name_he images.main');

        const total = await Order.countDocuments({ user: req.user.id });

        res.json({
            success: true,
            data: orders,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({
            success: false,
            message: 'שגיאה בקבלת הזמנות'
        });
    }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('items.product', 'name_he images.main asin')
            .populate('user', 'firstName lastName email');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'הזמנה לא נמצאה'
            });
        }

        // Check if user owns this order or is admin
        if (order.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'אין לך הרשאה לצפות בהזמנה זו'
            });
        }

        res.json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({
            success: false,
            message: 'שגיאה בקבלת הזמנה'
        });
    }
};

// @desc    Update order status (Admin only)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
export const updateOrderStatus = async (req, res) => {
    try {
        const { status, message } = req.body;

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'הזמנה לא נמצאה'
            });
        }

        order.status = status;
        order.timeline.push({
            status,
            message: message || `סטטוס עודכן ל-${status}`
        });

        // Update shipped/delivered dates
        if (status === 'shipped' && !order.shipping.shippedAt) {
            order.shipping.shippedAt = new Date();
        }
        if (status === 'delivered' && !order.shipping.deliveredAt) {
            order.shipping.deliveredAt = new Date();
        }

        await order.save();

        res.json({
            success: true,
            message: 'סטטוס הזמנה עודכן',
            data: order
        });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({
            success: false,
            message: 'שגיאה בעדכון סטטוס'
        });
    }
};