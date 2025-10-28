import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS } from '../utils/cache.js';

// Helper: Calculate cart totals from populated cart
// ⚡ IMPORTANT: cart.items.product must be populated before calling this function
const calculateCartTotals = (cart) => {
  let subtotal = 0;
  const validItems = [];

  for (const item of cart.items) {
    // ⭐ item.product is already populated - no DB query needed!
    const product = item.product;

    if (!product || product.status !== 'active' || !product.stock.available) {
      // Skip invalid/unavailable products
      continue;
    }

    validItems.push({
      ...item.toObject(),
      product: product,
      price: product.price.ils, // ⭐ מחיר מה-DB!
      subtotalPrice: product.price.ils * item.quantity
    });

    subtotal += product.price.ils * item.quantity;
  }

  const taxRate = parseFloat(process.env.TAX_RATE) || 0.17;
  const tax = subtotal * taxRate;

  const freeShippingThreshold = parseFloat(process.env.FREE_SHIPPING_THRESHOLD) || 200;
  const standardShippingCost = parseFloat(process.env.STANDARD_SHIPPING_COST) || 30;
  const shipping = subtotal >= freeShippingThreshold ? 0 : standardShippingCost;

  const total = subtotal + tax + shipping;

  return {
    items: validItems,
    subtotal,
    tax,
    shipping,
    total
  };
};

// @desc    Get user cart with calculated totals
// @route   GET /api/cart
// @access  Private
export const getCart = async (req, res) => {
  try {
    const startTime = Date.now();
    let cart = await Cart.findOne({ user: req.user.id }).populate('items.product');
    console.log(`⏱️ Cart findOne + populate took: ${Date.now() - startTime}ms`);

    if (!cart) {
      cart = await Cart.create({ user: req.user.id, items: [] });
    }

    // ⚡ חישוב בזמן אמת (cart כבר populated)
    const calcStart = Date.now();
    const cartWithTotals = calculateCartTotals(cart);
    console.log(`⏱️ Cart calculation took: ${Date.now() - calcStart}ms`);

    res.json({
      success: true,
      data: {
        _id: cart._id,
        user: cart.user,
        items: cartWithTotals.items,
        pricing: {
          subtotal: cartWithTotals.subtotal,
          tax: cartWithTotals.tax,
          shipping: cartWithTotals.shipping,
          total: cartWithTotals.total
        },
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt
      }
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בקבלת עגלה'
    });
  }
};

// @desc    Add item to cart
// @route   POST /api/cart/add
// @access  Private
export const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    // ⭐ Validate product from DB
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'מוצר לא נמצא'
      });
    }

    if (product.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'מוצר לא זמין'
      });
    }

    // ⭐ תיקון: stock.available במקום stock.inStock
    if (!product.stock.available) {
      return res.status(400).json({
        success: false,
        message: 'מוצר אזל מהמלאי'
      });
    }

    // Get or create cart
    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      cart = await Cart.create({ user: req.user.id, items: [] });
    }

    // Check if product already in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    if (existingItemIndex > -1) {
      // Update quantity
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;

      if (newQuantity > 10) {
        return res.status(400).json({
          success: false,
          message: 'כמות מקסימלית היא 10'
        });
      }

      cart.items[existingItemIndex].quantity = newQuantity;
    } else {
      // Add new item (without price!)
      cart.items.push({
        product: productId,
        quantity
      });
    }

    await cart.save();

    // ⚡ Populate products before calculating totals
    await cart.populate('items.product');

    // Return cart with calculated totals
    const cartWithTotals = calculateCartTotals(cart);

    res.json({
      success: true,
      message: 'המוצר נוסף לעגלה',
      data: {
        _id: cart._id,
        items: cartWithTotals.items,
        pricing: {
          subtotal: cartWithTotals.subtotal,
          tax: cartWithTotals.tax,
          shipping: cartWithTotals.shipping,
          total: cartWithTotals.total
        }
      }
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בהוספה לעגלה'
    });
  }
};

// @desc    Update cart item quantity
// @route   PUT /api/cart/update/:productId
// @access  Private
export const updateCartItem = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (quantity < 1 || quantity > 10) {
      return res.status(400).json({
        success: false,
        message: 'כמות לא חוקית'
      });
    }

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'עגלה לא נמצאה'
      });
    }

    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'מוצר לא נמצא בעגלה'
      });
    }

    // ⭐ Validate product still available
    const product = await Product.findById(productId);
    if (!product || product.status !== 'active' || !product.stock.available) {
      return res.status(400).json({
        success: false,
        message: 'מוצר לא זמין יותר'
      });
    }

    cart.items[itemIndex].quantity = quantity;
    await cart.save();

    // ⚡ Populate products before calculating totals
    await cart.populate('items.product');

    const cartWithTotals = calculateCartTotals(cart);

    res.json({
      success: true,
      message: 'כמות עודכנה',
      data: {
        _id: cart._id,
        items: cartWithTotals.items,
        pricing: {
          subtotal: cartWithTotals.subtotal,
          tax: cartWithTotals.tax,
          shipping: cartWithTotals.shipping,
          total: cartWithTotals.total
        }
      }
    });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון עגלה'
    });
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/remove/:productId
// @access  Private
export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'עגלה לא נמצאה'
      });
    }

    cart.items = cart.items.filter(item => item.product.toString() !== productId);

    await cart.save();

    // ⚡ Populate products before calculating totals
    await cart.populate('items.product');

    const cartWithTotals = calculateCartTotals(cart);

    res.json({
      success: true,
      message: 'המוצר הוסר מהעגלה',
      data: {
        _id: cart._id,
        items: cartWithTotals.items,
        pricing: {
          subtotal: cartWithTotals.subtotal,
          tax: cartWithTotals.tax,
          shipping: cartWithTotals.shipping,
          total: cartWithTotals.total
        }
      }
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בהסרה מהעגלה'
    });
  }
};

// @desc    Clear cart
// @route   DELETE /api/cart/clear
// @access  Private
export const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'עגלה לא נמצאה'
      });
    }

    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      message: 'העגלה נוקתה',
      data: {
        _id: cart._id,
        items: [],
        pricing: {
          subtotal: 0,
          tax: 0,
          shipping: 0,
          total: 0
        }
      }
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בניקוי עגלה'
    });
  }
};