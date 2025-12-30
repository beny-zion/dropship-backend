import Product from '../models/Product.js';
import Category from '../models/Category.js';
import mongoose from 'mongoose';
import { cacheGet, cacheSet, CACHE_KEYS } from '../utils/cache.js';

// @desc    Get all products
// @route   GET /api/products
// @access  Public
export const getProducts = async (req, res) => {
  try {
    const startTime = Date.now();
    const {
      page = 1,
      limit = 12,
      category,
      minPrice,
      maxPrice,
      search,
      sort = '-createdAt',
      featured,
      tags,
      brand
    } = req.query;

    // ⚡ Create cache key from query params
    const cacheKey = CACHE_KEYS.PRODUCTS_LIST({
      page, limit, category, minPrice, maxPrice, search, sort, featured, tags, brand
    });

    // ⚡ Check cache first
    let cachedData = cacheGet(cacheKey);
    if (cachedData) {
      console.log(`⏱️ Products list from cache took: ${Date.now() - startTime}ms`);
      return res.json(cachedData);
    }

    // בניית query
    // ✅ IMPORTANT: מציג רק מוצרים פעילים וזמינים
    // status = 'active' - מוצר מפורסם באתר (לא draft/discontinued)
    // stock.available = true - מוצר זמין (לא אזל מהמלאי)
    const query = {
      status: 'active',
      'stock.available': true
    };

    // פילטר לפי קטגוריה - תמיכה ב-slug או ID
    if (category && category !== 'all') {
      // בדוק אם זה ObjectId תקין
      if (mongoose.Types.ObjectId.isValid(category) && category.length === 24) {
        query.category = category;
      } else {
        // אם זה לא ID, חפש לפי slug
        const categoryDoc = await Category.findOne({ slug: category }).lean();
        if (categoryDoc) {
          query.category = categoryDoc._id;
        } else {
          // אם לא נמצאה קטגוריה, החזר תוצאה ריקה
          return res.json({
            success: true,
            data: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0
            }
          });
        }
      }
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

    // פילטר לפי תגים
    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      if (tagArray.length > 0) {
        query.tags = { $in: tagArray };
      }
    }

    // פילטר לפי מותג
    if (brand) {
      query['specifications.brand'] = new RegExp(brand.trim(), 'i');
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

    // ביצוע query - מסננים שדות רגישים ומידע אמזון
    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug styling') // Populate category with name, slug, and styling
        .sort(sortOption)
        .limit(limitNum)
        .skip(skip)
        .select('-__v -costBreakdown -links -asin -rating.amazonRating -rating.amazonReviewsCount -stats.sales')
        .lean(),
      Product.countDocuments(query)
    ]);

    console.log(`⏱️ Products list query took: ${Date.now() - startTime}ms`);

    const response = {
      success: true,
      data: products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    };

    // ⚡ Cache for 2 minutes (products list changes less frequently than individual products)
    cacheSet(cacheKey, response, 120);

    res.json(response);
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
    const startTime = Date.now();
    const cacheKey = CACHE_KEYS.PRODUCT(id);

    // ⚡ Check cache first
    let product = cacheGet(cacheKey);

    if (!product) {
      // חיפוש לפי ID או Slug - מסננים שדות רגישים ומידע אמזון
      product = await Product.findOne({
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
          { slug: id }
        ],
        status: 'active' // רק מוצרים פעילים
      }).select('-__v -costBreakdown -links -asin -rating.amazonRating -rating.amazonReviewsCount -stats.sales').lean();

      console.log(`⏱️ Product findOne took: ${Date.now() - startTime}ms`);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'מוצר לא נמצא'
        });
      }

      // ⚡ Cache for 5 minutes
      cacheSet(cacheKey, product, 300);
    } else {
      console.log(`⏱️ Product from cache took: ${Date.now() - startTime}ms`);
    }

    // עדכון מונה צפיות (async, don't wait)
    Product.updateOne(
      { _id: product._id },
      { $inc: { 'stats.views': 1 } }
    ).catch(err => console.error('View count update error:', err));

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

// @desc    Get popular tags
// @route   GET /api/products/tags
// @access  Public
export const getPopularTags = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Get all tags from active products and count occurrences
    const tagAggregation = await Product.aggregate([
      { $match: { status: 'active', tags: { $exists: true, $ne: [] } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit) },
      { $project: { tag: '$_id', count: 1, _id: 0 } }
    ]);

    res.json({
      success: true,
      data: tagAggregation
    });
  } catch (error) {
    console.error('Get popular tags error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת תגים',
      error: error.message
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