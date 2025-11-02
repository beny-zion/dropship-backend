import Category from '../models/Category.js';
import slugify from 'slugify';
import { deleteFromCloudinary, uploadBufferToCloudinary } from '../utils/cloudinary.js';

// @desc    Get all categories (public)
// @route   GET /api/categories
// @access  Public
export const getCategories = async (req, res) => {
  try {
    const { active, includeStats } = req.query;

    let query = {};
    if (active === 'true') {
      const categories = await Category.getActiveCategories();
      return res.json({
        success: true,
        count: categories.length,
        data: categories,
      });
    }

    const categories = await Category.find(query).sort({ displayOrder: 1 });

    res.json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת הקטגוריות',
      error: error.message,
    });
  }
};

// @desc    Get single category by ID or slug
// @route   GET /api/categories/:identifier
// @access  Public
export const getCategoryById = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { incrementView } = req.query;

    // Check if identifier is slug or ID
    const query = identifier.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: identifier }
      : { slug: identifier };

    const category = await Category.findOne(query);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'קטגוריה לא נמצאה',
      });
    }

    // Increment view count if requested
    if (incrementView === 'true') {
      await category.incrementViews();
    }

    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת הקטגוריה',
      error: error.message,
    });
  }
};

// @desc    Create new category
// @route   POST /api/categories
// @access  Admin only
export const createCategory = async (req, res) => {
  try {
    const categoryData = req.body;

    // Generate slug from Hebrew name if not provided
    if (!categoryData.slug && categoryData.name?.he) {
      categoryData.slug = slugify(categoryData.name.he, {
        lower: true,
        strict: true,
        locale: 'he',
      });
    }

    // Check if slug already exists
    const existingCategory = await Category.findOne({ slug: categoryData.slug });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'קטגוריה עם שם זהה כבר קיימת במערכת',
      });
    }

    const category = await Category.create(categoryData);

    res.status(201).json({
      success: true,
      message: 'הקטגוריה נוצרה בהצלחה',
      data: category,
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(400).json({
      success: false,
      message: 'שגיאה ביצירת הקטגוריה',
      error: error.message,
    });
  }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Admin only
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log('🔧 Update Category Request:');
    console.log('ID:', id);
    console.log('Update Data:', JSON.stringify(updateData, null, 2));

    // Get the existing category first
    const existingCategory = await Category.findById(id);

    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: 'קטגוריה לא נמצאה',
      });
    }

    // If name changed and not empty, update slug
    if (updateData.name?.he && updateData.name.he.trim() !== '') {
      const newSlug = slugify(updateData.name.he, {
        lower: true,
        strict: true,
        locale: 'he',
      });

      // Only update slug if it actually changed
      if (newSlug && newSlug !== existingCategory.slug) {
        // Check if new slug conflicts with existing category
        const conflictingCategory = await Category.findOne({
          slug: newSlug,
          _id: { $ne: id },
        });

        if (conflictingCategory) {
          return res.status(400).json({
            success: false,
            message: 'קטגוריה עם שם זהה כבר קיימת במערכת',
          });
        }

        updateData.slug = newSlug;
      } else {
        updateData.slug = existingCategory.slug;
      }
    } else {
      // If name not provided or empty, preserve existing slug to avoid validation error
      updateData.slug = existingCategory.slug;
    }

    const category = await Category.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    res.json({
      success: true,
      message: 'הקטגוריה עודכנה בהצלחה',
      data: category,
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(400).json({
      success: false,
      message: 'שגיאה בעדכון הקטגוריה',
      error: error.message,
    });
  }
};

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Admin only
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'קטגוריה לא נמצאה',
      });
    }

    // Delete images from Cloudinary if they exist
    if (category.mainImage?.publicId) {
      await deleteFromCloudinary(category.mainImage.publicId);
    }
    if (category.promotionalMedia?.publicId) {
      await deleteFromCloudinary(category.promotionalMedia.publicId);
    }

    await category.deleteOne();

    res.json({
      success: true,
      message: 'הקטגוריה נמחקה בהצלחה',
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה במחיקת הקטגוריה',
      error: error.message,
    });
  }
};

// @desc    Update category display order
// @route   PUT /api/categories/reorder
// @access  Admin only
export const reorderCategories = async (req, res) => {
  try {
    const { categories } = req.body; // Array of { id, displayOrder }

    if (!Array.isArray(categories)) {
      return res.status(400).json({
        success: false,
        message: 'נתונים לא תקינים',
      });
    }

    // Update all categories in parallel
    const updatePromises = categories.map(({ id, displayOrder }) =>
      Category.findByIdAndUpdate(id, { displayOrder }, { new: true })
    );

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'סדר הקטגוריות עודכן בהצלחה',
    });
  } catch (error) {
    console.error('Error reordering categories:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון סדר הקטגוריות',
      error: error.message,
    });
  }
};

// @desc    Increment category click count
// @route   POST /api/categories/:id/click
// @access  Public
export const incrementCategoryClick = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'קטגוריה לא נמצאה',
      });
    }

    await category.incrementClicks();

    res.json({
      success: true,
      message: 'נספר בהצלחה',
    });
  } catch (error) {
    console.error('Error incrementing click:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה',
      error: error.message,
    });
  }
};

// @desc    Upload category image
// @route   POST /api/categories/:id/upload
// @access  Admin only
export const uploadCategoryImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { imageType } = req.body; // 'main' or 'promotional'
    const { mediaType } = req.body; // 'image', 'gif', or 'video'

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'לא הועלה קובץ',
      });
    }

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'קטגוריה לא נמצאה',
      });
    }

    // Delete old image if exists
    if (imageType === 'main' && category.mainImage?.publicId) {
      await deleteFromCloudinary(category.mainImage.publicId);
    } else if (imageType === 'promotional' && category.promotionalMedia?.publicId) {
      await deleteFromCloudinary(category.promotionalMedia.publicId);
    }

    // Upload to Cloudinary
    const folder = `${process.env.CLOUDINARY_FOLDER || 'amazon-dropship'}/categories`;
    const uploadResult = await uploadBufferToCloudinary(req.file.buffer, folder);

    // Update category with new image
    const imageData = {
      url: uploadResult.url,
      publicId: uploadResult.publicId,
      alt: req.body.alt || category.name.he,
    };

    if (imageType === 'main') {
      category.mainImage = imageData;
    } else if (imageType === 'promotional') {
      category.promotionalMedia = {
        ...imageData,
        type: mediaType || 'image',
      };
    }

    await category.save();

    res.json({
      success: true,
      message: 'התמונה הועלתה בהצלחה',
      data: category,
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בהעלאת התמונה',
      error: error.message,
    });
  }
};

// @desc    Get category statistics
// @route   GET /api/categories/stats
// @access  Admin only
export const getCategoryStats = async (req, res) => {
  try {
    const categories = await Category.find().select('name stats').sort({ 'stats.clicks': -1 });

    const totalViews = categories.reduce((sum, cat) => sum + cat.stats.views, 0);
    const totalClicks = categories.reduce((sum, cat) => sum + cat.stats.clicks, 0);

    res.json({
      success: true,
      data: {
        totalCategories: categories.length,
        totalViews,
        totalClicks,
        categories: categories.map((cat) => ({
          id: cat._id,
          name: cat.name,
          views: cat.stats.views,
          clicks: cat.stats.clicks,
          clickThroughRate: cat.stats.views > 0 ? (cat.stats.clicks / cat.stats.views) * 100 : 0,
          lastViewed: cat.stats.lastViewed,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching category stats:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת הסטטיסטיקות',
      error: error.message,
    });
  }
};
