import Product from '../models/Product.js';
import { cacheDel, cacheDelPattern, CACHE_KEYS } from '../utils/cache.js';

// @desc    Create product
// @route   POST /api/admin/products
// @access  Private/Admin
export const createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);

    // ⚡ Clear products list cache (new product added)
    cacheDelPattern('products:');

    res.status(201).json({
      success: true,
      message: 'מוצר נוצר בהצלחה',
      data: product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה ביצירת מוצר',
      error: error.message
    });
  }
};

// @desc    Update product
// @route   PUT /api/admin/products/:id
// @access  Private/Admin
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'מוצר לא נמצא'
      });
    }

    // ⚡ Clear cache for this product so users get fresh data
    cacheDel(CACHE_KEYS.PRODUCT(id));
    cacheDel(CACHE_KEYS.PRODUCT(product.slug));
    cacheDel(CACHE_KEYS.PRODUCT(product.asin));

    // ⚡ Also clear products list cache (product details changed)
    cacheDelPattern('products:');

    res.json({
      success: true,
      message: 'מוצר עודכן בהצלחה',
      data: product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון מוצר',
      error: error.message
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/admin/products/:id
// @access  Private/Admin
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'מוצר לא נמצא'
      });
    }

    // ⚡ Clear cache for deleted product
    cacheDel(CACHE_KEYS.PRODUCT(id));
    cacheDel(CACHE_KEYS.PRODUCT(product.slug));
    cacheDel(CACHE_KEYS.PRODUCT(product.asin));

    // ⚡ Clear products list cache (product removed)
    cacheDelPattern('products:');

    res.json({
      success: true,
      message: 'מוצר נמחק בהצלחה'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה במחיקת מוצר',
      error: error.message
    });
  }
};

// @desc    Get all products (including inactive)
// @route   GET /api/admin/products
// @access  Private/Admin
export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .sort('-createdAt')
      .select('-__v')
      .lean();

    // Convert IDs to strings
    const productsWithStringIds = products.map(product => ({
      ...product,
      _id: product._id.toString()
    }));

    res.json({
      success: true,
      count: productsWithStringIds.length,
      data: productsWithStringIds
    });
  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת מוצרים'
    });
  }
};