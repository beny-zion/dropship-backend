// controllers/adminProductsController.js - Week 5: Products Management for Admin

import Product from '../models/Product.js';
import Order from '../models/Order.js';
import asyncHandler from '../utils/asyncHandler.js';

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
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Product.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: products,
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
  const product = await Product.findById(req.params.id);

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

  res.json({
    success: true,
    data: {
      product,
      stats: {
        views: product.stats.views || 0,
        clicks: product.stats.clicks || 0,
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
  // Check if ASIN already exists
  const existingProduct = await Product.findOne({ asin: req.body.asin });
  
  if (existingProduct) {
    return res.status(400).json({
      success: false,
      message: 'מוצר עם ASIN זה כבר קיים במערכת'
    });
  }

  const product = await Product.create(req.body);

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
  let product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'מוצר לא נמצא'
    });
  }

  // If updating ASIN, check if new ASIN exists
  if (req.body.asin && req.body.asin !== product.asin) {
    const existingProduct = await Product.findOne({ asin: req.body.asin });
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'ASIN זה כבר קיים במערכת'
      });
    }
  }

  product = await Product.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true
    }
  );

  res.json({
    success: true,
    message: 'המוצר עודכן בהצלחה',
    data: product
  });
});

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

  await product.deleteOne();

  res.json({
    success: true,
    message: 'המוצר נמחק בהצלחה'
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

export default {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
  toggleFeatured,
  bulkDeleteProducts,
  updateProductStatus
};
