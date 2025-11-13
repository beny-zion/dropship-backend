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

    if (!product || product.status !== 'active') {
      // Skip invalid/unavailable products
      continue;
    }

    // אם יש ווריאנט, בדוק את הזמינות שלו
    let isAvailable = product.stock.available;
    let itemPrice = product.price.ils;
    let variantInfo = null;

    if (item.variantSku) {
      const variant = product.variants?.find(v => v.sku === item.variantSku);
      if (!variant || !variant.stock.available) {
        continue; // דלג על ווריאנט לא זמין
      }
      // הוסף עלות נוספת של הווריאנט
      itemPrice += (variant.additionalCost?.ils || 0);
      variantInfo = {
        sku: variant.sku,
        color: variant.color,
        size: variant.size
      };
    }

    if (!isAvailable) {
      continue;
    }

    const itemData = item.toJSON();
    itemData.product = product;
    itemData.variant = variantInfo;
    itemData.price = itemPrice; // ⭐ מחיר בסיסי + עלות נוספת של ווריאנט
    itemData.subtotalPrice = itemPrice * item.quantity;
    validItems.push(itemData);

    subtotal += itemPrice * item.quantity;
  }

  const taxRate = parseFloat(process.env.TAX_RATE) || 0.18;

  // חישוב מע"מ כחלק מהמחיר (Tax-Inclusive)
  // המחיר כבר כולל מע"מ, אנחנו רק מחשבים כמה זה
  // נוסחה: מע"מ = מחיר × (18 / 118)
  const tax = subtotal * (taxRate / (1 + taxRate));

  // מחיר ללא מע"מ (לצורכי תצוגה בלבד)
  const subtotalWithoutVat = subtotal - tax;

  const freeShippingThreshold = parseFloat(process.env.FREE_SHIPPING_THRESHOLD) || 200;
  const standardShippingCost = parseFloat(process.env.STANDARD_SHIPPING_COST) || 30;
  const shipping = subtotal >= freeShippingThreshold ? 0 : standardShippingCost;

  // סה"כ = מחיר (כבר כולל מע"מ) + משלוח
  const total = subtotal + shipping;

  return {
    items: validItems,
    subtotal,              // מחיר כולל מע"מ
    subtotalWithoutVat,    // מחיר ללא מע"מ
    tax,                   // סכום המע"מ
    shipping,              // עלות משלוח
    total                  // סה"כ (מחיר כולל מע"מ + משלוח)
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
          subtotalWithoutVat: cartWithTotals.subtotalWithoutVat,
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
    const { productId, variantSku = null, quantity = 1 } = req.body;

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

    // בדיקת זמינות - תלוי אם יש ווריאנט או לא
    if (variantSku) {
      const variant = product.variants?.find(v => v.sku === variantSku);
      if (!variant) {
        return res.status(404).json({
          success: false,
          message: 'ווריאנט לא נמצא'
        });
      }
      if (!variant.stock.available) {
        return res.status(400).json({
          success: false,
          message: 'ווריאנט זה אזל מהמלאי'
        });
      }
    } else {
      // ⭐ תיקון: stock.available במקום stock.inStock
      if (!product.stock.available) {
        return res.status(400).json({
          success: false,
          message: 'מוצר אזל מהמלאי'
        });
      }
    }

    // Get or create cart
    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      cart = await Cart.create({ user: req.user.id, items: [] });
    }

    // Check if same product + variant already in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId &&
              (item.variantSku || null) === (variantSku || null)
    );

    if (existingItemIndex > -1) {
      // Update quantity
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;

      if (newQuantity > 2) {
        return res.status(400).json({
          success: false,
          message: 'כמות מקסימלית היא 2 יחידות למוצר'
        });
      }

      cart.items[existingItemIndex].quantity = newQuantity;
    } else {
      // Add new item (without price!)
      cart.items.push({
        product: productId,
        variantSku: variantSku,
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
          subtotalWithoutVat: cartWithTotals.subtotalWithoutVat,
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

    if (quantity < 1 || quantity > 2) {
      return res.status(400).json({
        success: false,
        message: 'כמות חייבת להיות בין 1 ל-2'
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
          subtotalWithoutVat: cartWithTotals.subtotalWithoutVat,
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
    const { variantSku = null } = req.query; // ווריאנט מגיע ב-query parameter

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'עגלה לא נמצאה'
      });
    }

    // סינון - הסר את המוצר והווריאנט הספציפי
    cart.items = cart.items.filter(item =>
      !(item.product.toString() === productId &&
        (item.variantSku || null) === (variantSku || null))
    );

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
          subtotalWithoutVat: cartWithTotals.subtotalWithoutVat,
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