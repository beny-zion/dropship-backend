// controllers/adminProductsController.js - Week 5: Products Management for Admin

import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Order from '../models/Order.js';
import asyncHandler from '../utils/asyncHandler.js';
import ImageTracking from '../models/ImageTracking.js';

// פונקציית עזר לחילוץ publicId מ-URL של Cloudinary
function extractPublicId(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.\w+$/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

// @desc    Get all products with pagination and filters (Admin)
// @route   GET /api/admin/products
// @access  Private/Admin
export const getAllProducts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Build filter object
  const filter = {};

  // Filter by status
  if (req.query.status) {
    filter.status = req.query.status;
  }

  // Filter by category
  if (req.query.category) {
    filter.category = req.query.category;
  }

  // Filter by stock availability
  if (req.query.inStock === 'true') {
    filter['stock.available'] = true;
  } else if (req.query.inStock === 'false') {
    filter['stock.available'] = false;
  }

  // Filter by featured
  if (req.query.featured === 'true') {
    filter.featured = true;
  }

  // Search by name or ASIN
  if (req.query.search) {
    filter.$or = [
      { name_he: { $regex: req.query.search, $options: 'i' } },
      { name_en: { $regex: req.query.search, $options: 'i' } },
      { asin: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  // Low stock filter
  if (req.query.lowStock === 'true') {
    filter['stock.quantity'] = { $lt: 10 };
  }

  // Build sort object
  const sortBy = req.query.sortBy || '-createdAt';
  
  // Execute queries in parallel
  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .populate('inventoryChecks.lastChecked.checkedBy', 'name email') // 🆕 טען גם inventoryChecks!
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .select('-__v')
      .lean(), // Convert to plain JavaScript objects
    Product.countDocuments(filter)
  ]);

  // Ensure _id is a string for each product
  const productsWithStringIds = products.map(product => ({
    ...product,
    _id: product._id.toString()
  }));

  res.json({
    success: true,
    data: productsWithStringIds,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalProducts: total,
      hasMore: skip + products.length < total
    }
  });
});

// @desc    Get single product details (Admin view with stats)
// @route   GET /api/admin/products/:id
// @access  Private/Admin
export const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('category', 'name slug')
    .lean();

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'מוצר לא נמצא'
    });
  }

  // Get sales stats for this product
  const salesStats = await Order.aggregate([
    { $unwind: '$items' },
    {
      $match: {
        'items.product': product._id,
        'payment.status': 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalSold: { $sum: '$items.quantity' },
        totalRevenue: {
          $sum: { $multiply: ['$items.quantity', '$items.price'] }
        }
      }
    }
  ]);

  // Convert ID to string
  const productWithStringId = {
    ...product,
    _id: product._id.toString()
  };

  res.json({
    success: true,
    data: {
      product: productWithStringId,
      stats: {
        views: product.stats?.views || 0,
        clicks: product.stats?.clicks || 0,
        sales: salesStats[0]?.totalSold || 0,
        revenue: salesStats[0]?.totalRevenue || 0
      }
    }
  });
});

// @desc    Create new product
// @route   POST /api/admin/products
// @access  Private/Admin
export const createProduct = asyncHandler(async (req, res) => {
  // ✅ 1. בדיקה ש-category נשלח בכלל (חובה!)
  if (!req.body.category) {
    return res.status(400).json({
      success: false,
      message: 'חובה לבחור קטגוריה למוצר'
    });
  }

  // ✅ 2. בדיקה שה-category תקין (ObjectId)
  if (!req.body.category.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: 'פורמט קטגוריה לא תקין (חייב להיות ObjectId)'
    });
  }

  // ✅ 3. בדיקה שהקטגוריה קיימת במערכת
  const category = await Category.findById(req.body.category);
  if (!category) {
    return res.status(400).json({
      success: false,
      message: 'הקטגוריה שנבחרה לא קיימת במערכת'
    });
  }

  // ✅ 4. ניקוי שדות לא רצויים (למניעת המצאת שדות)
  const allowedFields = [
    'asin', 'name_he', 'name_en', 'description_he', 'description_en',
    'price', 'originalPrice', 'discount', 'category', 'subcategory', 'tags',
    'images', 'links', 'supplier', 'shipping', 'shippingInfo',
    'specifications', 'features', 'variants', 'status', 'featured',
    'costBreakdown', 'stock'
  ];

  // סינון שדות לא מורשים
  const filteredBody = {};
  for (const key of Object.keys(req.body)) {
    if (allowedFields.includes(key)) {
      filteredBody[key] = req.body[key];
    }
  }

  // שימוש ב-body מסונן
  req.body = filteredBody;

  // ניקוי ASIN ריק
  if (req.body.asin === '' || req.body.asin === null) {
    delete req.body.asin;
  }

  // Check if ASIN already exists (רק אם סופק ASIN)
  if (req.body.asin && req.body.asin.trim()) {
    const existingProduct = await Product.findOne({ asin: req.body.asin.trim() });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'מוצר עם ASIN זה כבר קיים במערכת'
      });
    }
  }

  // בדיקת SKU ייחודיים בווריאנטים - רק אם יש SKU בפועל
  if (req.body.variants && req.body.variants.length > 0) {
    const skus = req.body.variants.map(v => v.sku).filter(Boolean);

    // רק אם יש SKU בפועל, נבדוק ייחודיות
    if (skus.length > 0) {
      const uniqueSkus = new Set(skus);

      // בדיקה שאין SKU כפול בתוך אותו מוצר
      if (skus.length !== uniqueSkus.size) {
        return res.status(400).json({
          success: false,
          message: 'SKU חייב להיות ייחודי בכל הווריאנטים'
        });
      }

      // הסרנו את הבדיקה הגלובלית - SKU לא חייב להיות ייחודי בין מוצרים שונים
      // מותגים שונים יכולים להשתמש באותו SKU פנימי
    }
  }

  const product = await Product.create(req.body);

  // עדכון מעקב תמונות
  for (let i = 0; i < product.images.length; i++) {
    const publicId = extractPublicId(product.images[i].url);
    if (publicId) {
      await ImageTracking.findOneAndUpdate(
        { publicId },
        {
          $addToSet: {
            usedIn: {
              type: 'product',
              referenceId: product._id,
              fieldPath: `images.${i}`
            }
          },
          status: 'active'
        },
        { upsert: true }
      );
    }
  }

  // עדכון תמונות ווריאנטים
  if (product.variants && product.variants.length > 0) {
    for (let v = 0; v < product.variants.length; v++) {
      const variant = product.variants[v];
      if (variant.images && variant.images.length > 0) {
        for (let i = 0; i < variant.images.length; i++) {
          const publicId = extractPublicId(variant.images[i].url);
          if (publicId) {
            await ImageTracking.findOneAndUpdate(
              { publicId },
              {
                $addToSet: {
                  usedIn: {
                    type: 'product',
                    referenceId: product._id,
                    fieldPath: `variants.${v}.images.${i}`
                  }
                },
                status: 'active'
              },
              { upsert: true }
            );
          }
        }
      }
    }
  }

  res.status(201).json({
    success: true,
    message: 'המוצר נוצר בהצלחה',
    data: product
  });
});

// @desc    Update product
// @route   PUT /api/admin/products/:id
// @access  Private/Admin
export const updateProduct = asyncHandler(async (req, res) => {
  const mongoose = (await import('mongoose')).default;
  const ProductAvailabilityService = (await import('../services/ProductAvailabilityService.js')).default;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1️⃣ שלוף את המוצר הקיים
    let product = await Product.findById(req.params.id).session(session);

    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'מוצר לא נמצא'
      });
    }

    // Check if category exists in the new category system
    if (req.body.category && req.body.category !== product.category?.toString()) {
      const category = await Category.findById(req.body.category).session(session);
      if (!category) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'הקטגוריה שנבחרה לא קיימת במערכת'
        });
      }
    }

    // ניקוי ASIN ריק
    if (req.body.asin === '' || req.body.asin === null) {
      req.body.asin = undefined;
    }

    // If updating ASIN, check if new ASIN exists
    if (req.body.asin && req.body.asin.trim() && req.body.asin !== product.asin) {
      const existingProduct = await Product.findOne({ asin: req.body.asin.trim() }).session(session);
      if (existingProduct) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'ASIN זה כבר קיים במערכת'
        });
      }
    }

    // בדיקת SKU ייחודיים בווריאנטים
    if (req.body.variants && req.body.variants.length > 0) {
      const skus = req.body.variants.map(v => v.sku).filter(Boolean);

      if (skus.length > 0) {
        const uniqueSkus = new Set(skus);

        if (skus.length !== uniqueSkus.size) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'SKU חייב להיות ייחודי בכל הווריאנטים'
          });
        }
      }
    }

    // 2️⃣ 🔍 בדוק אם יש שינוי בזמינות (Smart Detection)
    console.log('🔍 [updateProduct] Running Smart Detection...');
    console.log('🔍 [updateProduct] Current product stock:', product.stock);
    console.log('🔍 [updateProduct] Update data stock:', req.body.stock);
    const availabilityChanged = detectAvailabilityChanges(product, req.body);
    console.log('🔍 [updateProduct] Smart Detection result:', availabilityChanged);

    // 3️⃣ אם יש שינוי בזמינות - השתמש בשירות המרכזי
    if (availabilityChanged.hasChanges) {
      console.log('✅ [updateProduct] Availability changes detected, using centralized service...');
      for (const change of availabilityChanged.changes) {
        console.log('🔄 [updateProduct] Processing change:', change);
        await ProductAvailabilityService.updateAvailability({
          productId: product._id,
          variantSku: change.variantSku,
          available: change.newValue,
          reason: change.reason || 'עדכון ידני על ידי מנהל',
          source: 'admin_edit',
          triggeredBy: req.user._id,
          metadata: {
            previousValue: change.oldValue,
            editType: 'full_product_update'
          },
          session
        });
      }

      // ⭐ טען מחדש את המוצר אחרי עדכוני הזמינות
      product = await Product.findById(product._id).session(session);
    }

    // 4️⃣ עדכן את שאר השדות (הכל חוץ מזמינות)
    const sanitizedData = sanitizeUpdateData(req.body, availabilityChanged);

    Object.assign(product, sanitizedData);

    // 5️⃣ שמור
    await product.save({ session });
    await session.commitTransaction();

    // Convert ID to string
    const productWithStringId = {
      ...product.toObject(),
      _id: product._id.toString()
    };

    res.json({
      success: true,
      message: 'המוצר עודכן בהצלחה',
      data: productWithStringId,
      availabilityUpdates: availabilityChanged.changes.length
    });

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * 🔍 פונקציה לזיהוי שינויי זמינות
 */
function detectAvailabilityChanges(currentProduct, updateData) {
  const changes = [];

  // בדיקת זמינות כללית של המוצר
  if (
    updateData.stock?.available !== undefined &&
    updateData.stock.available !== currentProduct.stock?.available
  ) {
    changes.push({
      type: 'product',
      variantSku: null,
      oldValue: currentProduct.stock?.available,
      newValue: updateData.stock.available,
      reason: 'עדכון זמינות מוצר ראשי'
    });
  }

  // בדיקת שינויים בווריאנטים
  if (updateData.variants && Array.isArray(updateData.variants)) {
    updateData.variants.forEach((newVariant) => {
      const oldVariant = currentProduct.variants.find(
        v => v.sku === newVariant.sku
      );

      if (oldVariant) {
        // ווריאנט קיים - בדוק אם הזמינות השתנתה
        if (
          newVariant.stock?.available !== undefined &&
          newVariant.stock.available !== oldVariant.stock?.available
        ) {
          changes.push({
            type: 'variant',
            variantSku: newVariant.sku,
            oldValue: oldVariant.stock?.available,
            newValue: newVariant.stock.available,
            reason: `עדכון זמינות ווריאנט ${newVariant.color} ${newVariant.size}`
          });
        }
      } else {
        // ווריאנט חדש - אם הוא לא זמין, זה שינוי משמעותי
        if (newVariant.stock?.available === false) {
          changes.push({
            type: 'variant',
            variantSku: newVariant.sku,
            oldValue: undefined,
            newValue: false,
            reason: `ווריאנט חדש נוסף כלא זמין: ${newVariant.color} ${newVariant.size}`
          });
        }
      }
    });

    // בדוק ווריאנטים שנמחקו
    currentProduct.variants.forEach((oldVariant) => {
      const stillExists = updateData.variants.find(
        v => v.sku === oldVariant.sku
      );

      if (!stillExists && oldVariant.stock?.available) {
        changes.push({
          type: 'variant',
          variantSku: oldVariant.sku,
          oldValue: true,
          newValue: false,
          reason: `ווריאנט נמחק: ${oldVariant.color} ${oldVariant.size}`
        });
      }
    });
  }

  return {
    hasChanges: changes.length > 0,
    changes
  };
}

/**
 * 🧹 ניקוי data - הסרת שדות שכבר טופלו
 */
function sanitizeUpdateData(updateData, availabilityChanges) {
  const sanitized = { ...updateData };

  // אם טיפלנו בזמינות דרך השירות, הסר אותה מה-update הרגיל
  if (availabilityChanges.hasChanges) {
    // הסר stock.available אבל השאר שאר שדות stock
    if (sanitized.stock) {
      const { available, ...restStock } = sanitized.stock;
      sanitized.stock = restStock;
    }

    // הסר stock.available מווריאנטים אבל השאר שאר השדות
    if (sanitized.variants) {
      sanitized.variants = sanitized.variants.map(variant => {
        if (variant.stock) {
          const { available, ...restStock } = variant.stock;
          return {
            ...variant,
            stock: restStock
          };
        }
        return variant;
      });
    }
  }

  return sanitized;
}

// @desc    Delete product
// @route   DELETE /api/admin/products/:id
// @access  Private/Admin
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'מוצר לא נמצא'
    });
  }

  // Check if product is in any pending orders
  const ordersWithProduct = await Order.countDocuments({
    'items.product': product._id,
    status: { $in: ['pending', 'confirmed', 'processing'] }
  });

  if (ordersWithProduct > 0) {
    return res.status(400).json({
      success: false,
      message: `לא ניתן למחוק מוצר עם ${ordersWithProduct} הזמנות פעילות. שנה סטטוס ל-inactive במקום.`
    });
  }

  // איסוף publicIds של תמונות
  const imagePublicIds = [];

  // תמונות ראשיות של המוצר
  product.images?.forEach(img => {
    const publicId = extractPublicId(img.url);
    if (publicId) imagePublicIds.push(publicId);
  });

  // תמונות ווריאנטים
  product.variants?.forEach(variant => {
    variant.images?.forEach(img => {
      const publicId = extractPublicId(img.url);
      if (publicId) imagePublicIds.push(publicId);
    });
  });

  // מחיקת המוצר
  await product.deleteOne();

  // עדכון מעקב תמונות
  for (const publicId of imagePublicIds) {
    const tracking = await ImageTracking.findOne({ publicId });

    if (tracking) {
      // הסרת ההפניה למוצר
      tracking.usedIn = tracking.usedIn.filter(
        use => !(use.type === 'product' && use.referenceId.equals(product._id))
      );

      // אם אין שימושים - סימון כ-unused
      if (tracking.usedIn.length === 0) {
        tracking.status = 'unused';
      }

      await tracking.save();
    }
  }

  res.json({
    success: true,
    message: 'המוצר נמחק בהצלחה',
    imagesMarkedUnused: imagePublicIds.length
  });
});

// @desc    Update product stock
// @route   PATCH /api/admin/products/:id/stock
// @access  Private/Admin
export const updateStock = asyncHandler(async (req, res) => {
  const { quantity, available } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'מוצר לא נמצא'
    });
  }

  if (quantity !== undefined) {
    product.stock.quantity = quantity;
  }
  
  if (available !== undefined) {
    product.stock.available = available;
  }

  product.stock.lastChecked = Date.now();
  
  await product.save();

  res.json({
    success: true,
    message: 'מלאי עודכן בהצלחה',
    data: product
  });
});

// @desc    Toggle product featured status
// @route   PATCH /api/admin/products/:id/featured
// @access  Private/Admin
export const toggleFeatured = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'מוצר לא נמצא'
    });
  }

  product.featured = !product.featured;
  await product.save();

  res.json({
    success: true,
    message: `המוצר ${product.featured ? 'הוסף לבולטים' : 'הוסר מהבולטים'}`,
    data: product
  });
});

// @desc    Bulk delete products
// @route   POST /api/admin/products/bulk-delete
// @access  Private/Admin
export const bulkDeleteProducts = asyncHandler(async (req, res) => {
  const { productIds } = req.body;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'נא לספק רשימת מוצרים למחיקה'
    });
  }

  // Check for products in active orders
  const ordersWithProducts = await Order.countDocuments({
    'items.product': { $in: productIds },
    status: { $in: ['pending', 'confirmed', 'processing'] }
  });

  if (ordersWithProducts > 0) {
    return res.status(400).json({
      success: false,
      message: `חלק מהמוצרים קיימים בהזמנות פעילות ולא ניתן למחוק אותם`
    });
  }

  const result = await Product.deleteMany({ _id: { $in: productIds } });

  res.json({
    success: true,
    message: `${result.deletedCount} מוצרים נמחקו בהצלחה`,
    data: {
      deletedCount: result.deletedCount
    }
  });
});

// @desc    Update product status (active/inactive/discontinued)
// @route   PATCH /api/admin/products/:id/status
// @access  Private/Admin
export const updateProductStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const validStatuses = ['active', 'inactive', 'out_of_stock', 'discontinued'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'סטטוס לא תקין'
    });
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'מוצר לא נמצא'
    });
  }

  product.status = status;
  await product.save();

  res.json({
    success: true,
    message: 'סטטוס המוצר עודכן בהצלחה',
    data: product
  });
});

// עדכון זמינות מוצר וווריאנטים
export const updateProductAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { productAvailable, variants } = req.body;

  const product = await Product.findById(id);

  if (!product) {
    res.status(404);
    throw new Error('מוצר לא נמצא');
  }

  // עדכון זמינות מוצר ראשי
  if (typeof productAvailable === 'boolean') {
    product.stock.available = productAvailable;
  }

  // עדכון זמינות ווריאנטים
  if (variants && Array.isArray(variants)) {
    variants.forEach(({ sku, available }) => {
      const variant = product.variants.find(v => v.sku === sku);
      if (variant && typeof available === 'boolean') {
        variant.stock.available = available;
      }
    });
  }

  await product.save();

  res.json({
    success: true,
    message: 'הזמינות עודכנה בהצלחה',
    data: product
  });
});

export default {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
  toggleFeatured,
  bulkDeleteProducts,
  updateProductStatus,
  updateProductAvailability
};
