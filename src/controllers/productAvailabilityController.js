/**
 * Product Availability Controller
 * ================================
 * Controller מרכזי לכל פעולות זמינות מוצרים.
 * נקודת כניסה יחידה לעדכון זמינות במערכת.
 */

import asyncHandler from '../utils/asyncHandler.js';
import ProductAvailabilityService from '../services/ProductAvailabilityService.js';
import AuditLog from '../models/AuditLog.js';

/**
 * @route   PATCH /api/admin/products/:productId/availability
 * @desc    עדכון זמינות מוצר/ווריאנט (נקודת כניסה מרכזית)
 * @access  Private/Admin
 */
export const updateAvailability = asyncHandler(async (req, res) => {
  console.log('🔵 [updateAvailability] ===== התחלה =====');
  console.log('🔵 [updateAvailability] req.params:', req.params);
  console.log('🔵 [updateAvailability] req.body:', JSON.stringify(req.body, null, 2));

  const { productId } = req.params;
  const {
    variantSku,
    available,
    reason,
    source = 'admin_edit',
    metadata = {}
  } = req.body;

  console.log('🔵 [updateAvailability] Parsed values:');
  console.log('  - productId:', productId);
  console.log('  - variantSku:', variantSku);
  console.log('  - available:', available, typeof available);
  console.log('  - reason:', reason);
  console.log('  - source:', source);

  // Validation
  if (typeof available !== 'boolean') {
    console.log('❌ [updateAvailability] Validation failed: available is not boolean');
    return res.status(400).json({
      success: false,
      message: 'available חייב להיות true או false'
    });
  }

  if (!reason || reason.trim() === '' || reason.length > 500) {
    console.log('❌ [updateAvailability] Validation failed: reason invalid');
    return res.status(400).json({
      success: false,
      message: 'סיבה חייבת להיות בין 1-500 תווים'
    });
  }

  // Sanitize reason - prevent XSS
  const sanitizedReason = reason.trim().substring(0, 500);

  console.log('✅ [updateAvailability] Validation passed');

  // קריאה לשירות המרכזי
  console.log('🔵 [updateAvailability] Calling ProductAvailabilityService...');
  const result = await ProductAvailabilityService.updateAvailability({
    productId,
    variantSku: variantSku || null,
    available,
    reason: sanitizedReason,
    source,
    triggeredBy: req.user._id,
    metadata
  });

  console.log('✅ [updateAvailability] Service returned successfully');
  console.log('🔵 [updateAvailability] Result:', {
    productId: result.product?._id,
    cascaded: result.cascadeResult?.cascaded,
    affectedVariants: result.cascadeResult?.affectedVariants?.length,
    affectedOrders: result.affectedOrders?.length,
    affectedCarts: result.affectedCarts?.length
  });

  res.json({
    success: true,
    message: available ? 'המוצר סומן כזמין' : 'המוצר סומן כלא זמין',
    data: {
      product: result.product,
      cascadeResult: result.cascadeResult,
      affectedOrders: result.affectedOrders,
      affectedCarts: result.affectedCarts,
      priceChangeDetected: result.priceChangeDetected
    }
  });

  console.log('🔵 [updateAvailability] ===== סיום =====');
});

/**
 * @route   POST /api/admin/products/:productId/check-availability
 * @desc    בדיקת זמינות + עדכון מחיר (לשימוש ב-Inventory Check)
 * @access  Private/Admin
 */
export const checkAndUpdateAvailability = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const {
    variantSku,
    available,
    currentPrice, // המחיר שהמשתמש רואה אצל הספק
    notes
  } = req.body;

  // Validation
  if (typeof available !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'available חייב להיות true או false'
    });
  }

  if (currentPrice && (isNaN(currentPrice) || currentPrice < 0)) {
    return res.status(400).json({
      success: false,
      message: 'currentPrice חייב להיות מספר חיובי'
    });
  }

  // Sanitize notes
  const reasonText = (notes || 'בדיקת זמינות ידנית').trim().substring(0, 500);

  const result = await ProductAvailabilityService.updateAvailability({
    productId,
    variantSku: variantSku || null,
    available,
    reason: reasonText,
    source: 'inventory_check',
    triggeredBy: req.user._id,
    metadata: {
      actualPrice: currentPrice,
      checkType: 'manual_verification'
    }
  });

  res.json({
    success: true,
    message: 'בדיקת זמינות הושלמה בהצלחה',
    data: {
      product: result.product,
      cascadeResult: result.cascadeResult,
      priceChanged: result.priceChangeDetected?.isSignificant || false,
      priceChangeDetails: result.priceChangeDetected,
      affectedOrders: result.affectedOrders,
      affectedCarts: result.affectedCarts
    }
  });
});

/**
 * @route   GET /api/admin/products/:productId/availability-history
 * @desc    היסטוריית שינויי זמינות
 * @access  Private/Admin
 */
export const getAvailabilityHistory = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { variantSku, limit = 50 } = req.query;

  const query = {
    targetType: 'Product',
    targetId: productId,
    action: { $in: ['MARK_AVAILABLE', 'MARK_UNAVAILABLE'] }
  };

  if (variantSku) {
    query['details.variantSku'] = variantSku;
  }

  const history = await AuditLog.find(query)
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .populate('user', 'name email')
    .lean();

  res.json({
    success: true,
    data: history,
    count: history.length
  });
});

/**
 * @route   GET /api/admin/products/:productId/price-history
 * @desc    היסטוריית מחירים
 * @access  Private/Admin
 */
export const getPriceHistory = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { limit = 50 } = req.query;

  const Product = (await import('../models/Product.js')).default;
  const product = await Product.findById(productId)
    .select('name_he priceTracking costBreakdown')
    .lean();

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'מוצר לא נמצא'
    });
  }

  const priceHistory = product.priceTracking?.priceHistory || [];
  const limitedHistory = priceHistory.slice(-parseInt(limit));

  res.json({
    success: true,
    data: {
      productName: product.name_he,
      currentPrice: product.costBreakdown?.baseCost?.ils,
      lastCheckedPrice: product.priceTracking?.lastCheckedPrice,
      priceAlertThreshold: product.priceTracking?.priceAlertThreshold || 10,
      history: limitedHistory,
      count: limitedHistory.length
    }
  });
});

/**
 * @route   POST /api/admin/products/:productId/inventory-check
 * @desc    שמירת בדיקת זמינות (עדכון "נבדק ב")
 * @access  Private/Admin
 */
export const recordInventoryCheck = asyncHandler(async (req, res) => {
  console.log('🟣 [recordInventoryCheck] ===== התחלה =====');
  console.log('🟣 [recordInventoryCheck] Product ID:', req.params.productId);
  console.log('🟣 [recordInventoryCheck] User:', req.user?._id, req.user?.name);

  const { productId } = req.params;
  const { result, notes, variantsSnapshot } = req.body;

  // Validation
  if (!result || !['available', 'unavailable', 'partial'].includes(result)) {
    console.log('❌ [recordInventoryCheck] Invalid result:', result);
    return res.status(400).json({
      success: false,
      message: 'result חייב להיות available, unavailable, או partial'
    });
  }

  const Product = (await import('../models/Product.js')).default;
  const product = await Product.findById(productId);

  if (!product) {
    console.log('❌ [recordInventoryCheck] Product not found');
    return res.status(404).json({
      success: false,
      message: 'מוצר לא נמצא'
    });
  }

  const timestamp = new Date();
  const checkedByName = req.user.name || req.user.email;

  // עדכון lastChecked
  if (!product.inventoryChecks) {
    product.inventoryChecks = { history: [] };
  }

  product.inventoryChecks.lastChecked = {
    timestamp,
    checkedBy: req.user._id,
    checkedByName,
    result,
    notes: notes || ''
  };

  // הוספה להיסטוריה
  product.inventoryChecks.history.push({
    timestamp,
    checkedBy: req.user._id,
    checkedByName,
    result,
    notes: notes || '',
    variantsSnapshot: variantsSnapshot || []
  });

  // שמירת היסטוריה מוגבלת ל-100 רשומות אחרונות
  if (product.inventoryChecks.history.length > 100) {
    product.inventoryChecks.history = product.inventoryChecks.history.slice(-100);
  }

  await product.save();

  console.log('✅ [recordInventoryCheck] Saved successfully');
  console.log('🟣 [recordInventoryCheck] Last checked:', product.inventoryChecks.lastChecked);

  res.json({
    success: true,
    message: 'בדיקת זמינות נשמרה בהצלחה',
    data: {
      lastChecked: product.inventoryChecks.lastChecked,
      historyCount: product.inventoryChecks.history.length
    }
  });

  console.log('🟣 [recordInventoryCheck] ===== סיום =====');
});

/**
 * @route   GET /api/admin/products/:productId/inventory-check
 * @desc    שליפת מידע על בדיקת זמינות אחרונה
 * @access  Private/Admin
 */
export const getInventoryCheck = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { limit = 20 } = req.query;

  const Product = (await import('../models/Product.js')).default;
  const product = await Product.findById(productId)
    .select('name_he inventoryChecks')
    .populate('inventoryChecks.lastChecked.checkedBy', 'name email')
    .populate('inventoryChecks.history.checkedBy', 'name email')
    .lean();

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'מוצר לא נמצא'
    });
  }

  const inventoryChecks = product.inventoryChecks || { history: [] };
  const limitedHistory = inventoryChecks.history?.slice(-parseInt(limit)) || [];

  res.json({
    success: true,
    data: {
      productName: product.name_he,
      lastChecked: inventoryChecks.lastChecked || null,
      history: limitedHistory,
      historyCount: limitedHistory.length
    }
  });
});

/**
 * @route   POST /api/admin/products/:productId/availability/batch
 * @desc    עדכון Batch של זמינות מוצר + ווריאנטים (ביצועים!)
 * @access  Private/Admin
 */
export const batchUpdateAvailability = asyncHandler(async (req, res) => {
  console.log('🟣 [batchUpdateAvailability] ===== התחלה =====');
  console.log('🟣 [batchUpdateAvailability] Product ID:', req.params.productId);
  console.log('🟣 [batchUpdateAvailability] Body:', JSON.stringify(req.body, null, 2));

  const { productId } = req.params;
  const { product: productUpdate, variants, reason, source = 'inventory_check' } = req.body;

  // Validation
  if (!reason || reason.trim() === '' || reason.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'סיבה חייבת להיות בין 1-500 תווים'
    });
  }

  const sanitizedReason = reason.trim().substring(0, 500);

  // Update main product first (if provided)
  let mainResult = null;
  if (productUpdate && typeof productUpdate.available === 'boolean') {
    console.log('🟣 [batchUpdateAvailability] Updating main product...');
    mainResult = await ProductAvailabilityService.updateAvailability({
      productId,
      available: productUpdate.available,
      reason: sanitizedReason,
      source,
      triggeredBy: req.user._id,
      metadata: productUpdate.metadata || {}
    });
  }

  // Update variants sequentially (to respect cascade rules)
  const variantResults = [];
  if (variants && Array.isArray(variants)) {
    console.log(`🟣 [batchUpdateAvailability] Updating ${variants.length} variants...`);
    for (const variant of variants) {
      if (!variant.sku || typeof variant.available !== 'boolean') {
        console.warn('⚠️ [batchUpdateAvailability] Skipping invalid variant:', variant);
        continue;
      }

      try {
        const result = await ProductAvailabilityService.updateAvailability({
          productId,
          variantSku: variant.sku,
          available: variant.available,
          reason: sanitizedReason,
          source,
          triggeredBy: req.user._id,
          metadata: variant.metadata || {}
        });
        variantResults.push({ sku: variant.sku, success: true, result });
      } catch (error) {
        console.error(`❌ [batchUpdateAvailability] Failed to update variant ${variant.sku}:`, error);
        variantResults.push({ sku: variant.sku, success: false, error: error.message });
      }
    }
  }

  console.log('✅ [batchUpdateAvailability] Completed!');
  console.log(`   - Main product: ${mainResult ? 'updated' : 'not changed'}`);
  console.log(`   - Variants: ${variantResults.filter(v => v.success).length}/${variantResults.length} succeeded`);

  res.json({
    success: true,
    message: 'עדכון Batch הושלם בהצלחה',
    data: {
      product: mainResult,
      variants: variantResults,
      stats: {
        totalVariants: variantResults.length,
        successfulVariants: variantResults.filter(v => v.success).length,
        failedVariants: variantResults.filter(v => !v.success).length
      }
    }
  });

  console.log('🟣 [batchUpdateAvailability] ===== סיום =====');
});

export default {
  updateAvailability,
  checkAndUpdateAvailability,
  batchUpdateAvailability,
  getAvailabilityHistory,
  getPriceHistory,
  recordInventoryCheck,
  getInventoryCheck
};
