import { v2 as cloudinary } from 'cloudinary';
import ImageTracking from '../models/ImageTracking.js';

/**
 * קבלת סטטיסטיקות שימוש מ-Cloudinary
 */
export async function getCloudinaryUsage() {
  try {
    const usage = await cloudinary.api.usage();

    // Default limits for free tier (in bytes)
    const DEFAULT_STORAGE_LIMIT = 25 * 1024 * 1024 * 1024; // 25 GB
    const DEFAULT_BANDWIDTH_LIMIT = 25 * 1024 * 1024 * 1024; // 25 GB
    const DEFAULT_TRANSFORMATIONS_LIMIT = 25000;

    const storageUsage = usage.storage?.usage || 0;
    const storageLimit = usage.storage?.limit || DEFAULT_STORAGE_LIMIT;
    const bandwidthUsage = usage.bandwidth?.usage || 0;
    const bandwidthLimit = usage.bandwidth?.limit || DEFAULT_BANDWIDTH_LIMIT;
    const transformationsUsage = usage.transformations?.usage || 0;
    const transformationsLimit = usage.transformations?.limit || DEFAULT_TRANSFORMATIONS_LIMIT;

    return {
      credits: {
        used: usage.credits?.usage || 0,
        limit: usage.credits?.limit || 25,
        percent: usage.credits?.used_percent || 0
      },
      storage: {
        used: Math.round(storageUsage / (1024 * 1024)), // MB
        limit: Math.round(storageLimit / (1024 * 1024)), // MB
        percent: storageLimit > 0 ? (storageUsage / storageLimit) * 100 : 0
      },
      bandwidth: {
        used: Math.round(bandwidthUsage / (1024 * 1024)), // MB
        limit: Math.round(bandwidthLimit / (1024 * 1024)), // MB
        percent: bandwidthLimit > 0 ? (bandwidthUsage / bandwidthLimit) * 100 : 0
      },
      transformations: {
        used: transformationsUsage,
        limit: transformationsLimit,
        percent: transformationsLimit > 0 ? ((transformationsUsage / transformationsLimit) * 100) : 0
      }
    };
  } catch (error) {
    console.error('Error getting Cloudinary usage:', error);
    throw new Error('לא ניתן לקבל נתוני שימוש מ-Cloudinary');
  }
}

/**
 * קבלת כל התמונות מ-Cloudinary
 */
export async function getAllCloudinaryImages(folder = process.env.CLOUDINARY_FOLDER) {
  const allResources = [];
  let nextCursor = null;

  try {
    do {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: folder,
        max_results: 500,
        next_cursor: nextCursor
      });

      allResources.push(...result.resources);
      nextCursor = result.next_cursor;
    } while (nextCursor);

    return allResources;
  } catch (error) {
    console.error('Error getting Cloudinary images:', error);
    throw new Error('לא ניתן לקבל רשימת תמונות מ-Cloudinary');
  }
}

/**
 * סנכרון תמונות בין Cloudinary למסד הנתונים
 */
export async function syncCloudinaryImages() {
  const cloudinaryImages = await getAllCloudinaryImages();
  const trackedImages = await ImageTracking.find({});

  const cloudinaryIds = new Set(cloudinaryImages.map(img => img.public_id));
  const trackedIds = new Set(trackedImages.map(img => img.publicId));

  // תמונות שב-Cloudinary אבל לא במעקב
  const missingInTracking = cloudinaryImages.filter(
    img => !trackedIds.has(img.public_id)
  );

  // תמונות שבמעקב אבל לא ב-Cloudinary
  const missingInCloudinary = trackedImages.filter(
    img => !cloudinaryIds.has(img.publicId)
  );

  // תמונות לא בשימוש
  const unusedImages = trackedImages.filter(
    img => !img.isUsed && img.status !== 'deleted'
  );

  return {
    missingInTracking,
    missingInCloudinary,
    unusedImages,
    summary: {
      totalCloudinary: cloudinaryImages.length,
      totalTracked: trackedImages.length,
      missingInTracking: missingInTracking.length,
      missingInCloudinary: missingInCloudinary.length,
      unused: unusedImages.length
    }
  };
}

/**
 * מחיקת תמונות לא בשימוש
 */
export async function cleanupUnusedImages(dryRun = true, specificIds = null) {
  let imagesToDelete;

  if (specificIds && specificIds.length > 0) {
    imagesToDelete = await ImageTracking.find({
      publicId: { $in: specificIds }
    });
  } else {
    imagesToDelete = await ImageTracking.find({
      status: 'unused',
      $or: [
        { 'usedIn.0': { $exists: false } },
        { usedIn: { $size: 0 } }
      ]
    });
  }

  if (dryRun) {
    return {
      dryRun: true,
      wouldDelete: imagesToDelete.length,
      images: imagesToDelete.map(img => ({
        publicId: img.publicId,
        size: img.size,
        uploadedAt: img.uploadedAt
      }))
    };
  }

  const results = {
    deleted: 0,
    failed: 0,
    spaceFreed: 0,
    details: []
  };

  for (const image of imagesToDelete) {
    try {
      await cloudinary.uploader.destroy(image.publicId);

      image.status = 'deleted';
      await image.save();

      results.deleted++;
      results.spaceFreed += image.size;
      results.details.push({
        publicId: image.publicId,
        status: 'deleted'
      });
    } catch (error) {
      results.failed++;
      results.details.push({
        publicId: image.publicId,
        status: 'failed',
        error: error.message
      });
    }
  }

  results.spaceFreed = (results.spaceFreed / (1024 * 1024)).toFixed(2); // MB

  return results;
}
