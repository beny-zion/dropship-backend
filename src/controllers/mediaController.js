import asyncHandler from '../utils/asyncHandler.js';
import ImageTracking from '../models/ImageTracking.js';
import * as cloudinaryService from '../services/cloudinaryService.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import HomePage from '../models/HomePage.js';

/**
 * @desc    Get media statistics
 * @route   GET /api/admin/media/stats
 * @access  Private/Admin
 */
export const getMediaStats = asyncHandler(async (req, res) => {
  // קבלת נתוני Cloudinary
  const cloudinaryUsage = await cloudinaryService.getCloudinaryUsage();
  const cloudinaryImages = await cloudinaryService.getAllCloudinaryImages();

  // קבלת נתוני מסד נתונים
  const [products, categories, homePages, trackedImages] = await Promise.all([
    Product.countDocuments(),
    Category.countDocuments(),
    HomePage.countDocuments(),
    ImageTracking.find({})
  ]);

  const dbStats = {
    totalImages: trackedImages.length,
    byType: {
      products: trackedImages.filter(img =>
        img.usedIn.some(use => use.type === 'product')
      ).length,
      categories: trackedImages.filter(img =>
        img.usedIn.some(use => use.type === 'category')
      ).length,
      homepage: trackedImages.filter(img =>
        img.usedIn.some(use => use.type === 'homepage')
      ).length
    }
  };

  // סנכרון
  const syncResults = await cloudinaryService.syncCloudinaryImages();

  res.json({
    success: true,
    data: {
      cloudinary: {
        usage: cloudinaryUsage,
        images: {
          total: cloudinaryImages.length,
          byFolder: cloudinaryImages.reduce((acc, img) => {
            const folder = img.public_id.split('/').slice(0, -1).join('/') || 'root';
            acc[folder] = (acc[folder] || 0) + 1;
            return acc;
          }, {})
        }
      },
      database: dbStats,
      sync: {
        unusedInCloudinary: syncResults.summary.unused,
        missingInCloudinary: syncResults.summary.missingInCloudinary,
        lastSyncAt: new Date()
      }
    }
  });
});

/**
 * @desc    Get images list with filters
 * @route   GET /api/admin/media/images
 * @access  Private/Admin
 */
export const getImages = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};

  // סינון לפי סטטוס
  if (req.query.status === 'used') {
    filter['usedIn.0'] = { $exists: true };
  } else if (req.query.status === 'unused') {
    filter.$or = [
      { 'usedIn.0': { $exists: false } },
      { usedIn: { $size: 0 } }
    ];
  }

  // סינון לפי תיקייה
  if (req.query.folder) {
    filter.publicId = { $regex: `^${req.query.folder}` };
  }

  // מיון
  const sortBy = req.query.sortBy === 'size' ? { size: -1 } :
                 req.query.sortBy === 'name' ? { publicId: 1 } :
                 { uploadedAt: -1 };

  const [images, total] = await Promise.all([
    ImageTracking.find(filter)
      .populate('uploadedBy', 'name email')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
    ImageTracking.countDocuments(filter)
  ]);

  // הוספת מידע על שימוש
  const enrichedImages = await Promise.all(images.map(async (img) => {
    const usedInDetails = await Promise.all(img.usedIn.map(async (use) => {
      let name = 'Unknown';

      if (use.type === 'product') {
        const product = await Product.findById(use.referenceId).select('name_he');
        name = product?.name_he || 'מוצר לא קיים';
      } else if (use.type === 'category') {
        const category = await Category.findById(use.referenceId).select('name');
        name = category?.name || 'קטגוריה לא קיימת';
      }

      return {
        type: use.type,
        id: use.referenceId,
        name
      };
    }));

    return {
      ...img,
      usedIn: usedInDetails,
      status: img.usedIn.length > 0 ? 'active' : 'unused'
    };
  }));

  res.json({
    success: true,
    data: {
      images: enrichedImages,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalImages: total,
        hasMore: skip + images.length < total
      }
    }
  });
});

/**
 * @desc    Run sync between Cloudinary and database
 * @route   POST /api/admin/media/sync
 * @access  Private/Admin
 */
export const syncImages = asyncHandler(async (req, res) => {
  const results = await cloudinaryService.syncCloudinaryImages();

  const recommendations = [];

  if (results.summary.unused > 0) {
    recommendations.push(`נמצאו ${results.summary.unused} תמונות לא בשימוש - ניתן למחוק`);
  }

  if (results.summary.missingInCloudinary > 0) {
    recommendations.push(`נמצאו ${results.summary.missingInCloudinary} URLs שבורים במסד הנתונים`);
  }

  if (results.summary.missingInTracking > 0) {
    recommendations.push(`נמצאו ${results.summary.missingInTracking} תמונות ב-Cloudinary שלא במעקב`);
  }

  if (recommendations.length === 0) {
    recommendations.push('הכל מסונכרן בצורה מושלמת!');
  }

  res.json({
    success: true,
    data: {
      unusedImages: results.unusedImages.map(img => ({
        publicId: img.publicId,
        url: img.url,
        size: img.size,
        createdAt: img.createdAt
      })),
      missingImages: results.missingInCloudinary.map(img => img.publicId),
      summary: results.summary,
      recommendations
    }
  });
});

/**
 * @desc    Cleanup unused images
 * @route   DELETE /api/admin/media/cleanup
 * @access  Private/Admin
 */
export const cleanupImages = asyncHandler(async (req, res) => {
  const { dryRun = true, publicIds = null } = req.body;

  const results = await cloudinaryService.cleanupUnusedImages(dryRun, publicIds);

  res.json({
    success: true,
    data: results,
    message: dryRun
      ? `Preview: ${results.wouldDelete} תמונות ניתן למחוק`
      : `נמחקו ${results.deleted} תמונות בהצלחה`
  });
});

/**
 * @desc    Initial sync - add all Cloudinary images to tracking
 * @route   POST /api/admin/media/initial-sync
 * @access  Private/Admin
 */
export const initialSync = asyncHandler(async (req, res) => {
  const results = await cloudinaryService.syncCloudinaryImages();

  // Add missing images to tracking
  let addedCount = 0;
  for (const img of results.missingInTracking) {
    await ImageTracking.create({
      publicId: img.public_id,
      url: img.secure_url,
      size: img.bytes || 0,
      format: img.format,
      cloudinaryMetadata: {
        width: img.width,
        height: img.height,
        resourceType: img.resource_type,
        bytes: img.bytes,
        createdAt: new Date(img.created_at)
      },
      status: 'orphaned'
    });
    addedCount++;
  }

  res.json({
    success: true,
    data: {
      added: addedCount,
      summary: results.summary
    },
    message: `נוספו ${addedCount} תמונות למעקב`
  });
});
