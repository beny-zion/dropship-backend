import Product from '../models/Product.js';
import mongoose from 'mongoose';

// @desc    Get all products
// @route   GET /api/products
// @access  Public
export const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      minPrice,
      maxPrice,
      search,
      sort = '-createdAt',
      featured
    } = req.query;

    // בניית query
    const query = { status: 'active' };

    // פילטר לפי קטגוריה
    if (category && category !== 'all') {
      query.category = category;
    }

    // פילטר לפי מחיר
    if (minPrice || maxPrice) {
      query['price.ils'] = {};
      if (minPrice) query['price.ils'].$gte = Number(minPrice);
      if (maxPrice) query['price.ils'].$lte = Number(maxPrice);
    }

    // חיפוש טקסט
    if (search) {
      query.$text = { $search: search };
    }

    // מוצרים מומלצים
    if (featured === 'true') {
      query.featured = true;
    }

    // מיון
    let sortOption = {};
    switch (sort) {
      case 'price_asc':
        sortOption = { 'price.ils': 1 };
        break;
      case 'price_desc':
        sortOption = { 'price.ils': -1 };
        break;
      case 'rating':
        sortOption = { 'rating.average': -1 };
        break;
      case 'popular':
        sortOption = { 'stats.views': -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // ביצוע query
    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortOption)
        .limit(limitNum)
        .skip(skip)
        .select('-__v'),
      Product.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת מוצרים',
      error: error.message
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // חיפוש לפי ID או Slug
    const product = await Product.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { slug: id },
        { asin: id.toUpperCase() }
      ]
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'מוצר לא נמצא'
      });
    }

    // עדכון מונה צפיות
    product.stats.views += 1;
    await product.save();

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת המוצר',
      error: error.message
    });
  }
};

// @desc    Get product categories
// @route   GET /api/products/categories
// @access  Public
export const getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => ({
        name: category,
        count: await Product.countDocuments({ 
          category, 
          status: 'active' 
        })
      }))
    );

    res.json({
      success: true,
      data: categoriesWithCount
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת קטגוריות'
    });
  }
};

// @desc    Track product click
// @route   POST /api/products/:id/click
// @access  Public
export const trackClick = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'מוצר לא נמצא'
      });
    }

    product.stats.clicks += 1;
    await product.save();

    res.json({
      success: true,
      message: 'קליק נרשם'
    });
  } catch (error) {
    console.error('Track click error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה'
    });
  }
};