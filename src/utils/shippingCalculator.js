/**
 * Shipping Calculator - Simplified Version
 *
 * מחשבון משלוח מפושט עם תמיכה במשלוח קבוע מ-SystemSettings
 * גרסה חדשה: 49₪ קבוע (או לפי SystemSettings)
 */

import SystemSettings from '../models/SystemSettings.js';

// ============================================
// NEW CODE - SIMPLIFIED SHIPPING (49₪ קבוע)
// ============================================

/**
 * חישוב משלוח פשוט - מחיר קבוע מ-SystemSettings
 *
 * @param {Array} items - פריטי ההזמנה
 * @param {Object} settings - הגדרות מערכת (אופציונלי)
 * @param {string} currency - USD או ILS
 * @returns {Object} { shipping, freeShipping, breakdown }
 */
export async function calculateShipping(items, settings = null, currency = 'ILS') {
  // טען הגדרות אם לא קיבלנו
  if (!settings) {
    settings = await SystemSettings.getSettings();
  }

  // סינון פריטים פעילים (לא מבוטלים)
  const activeItems = items.filter(item => {
    const isCancelled = item.status === 'cancelled' ||
                       item.itemStatus === 'cancelled' ||
                       item.cancellation?.cancelled === true;
    return !isCancelled;
  });

  // אין פריטים פעילים = אין משלוח
  if (activeItems.length === 0) {
    return {
      shipping: 0,
      freeShipping: false,
      breakdown: {
        activeItems: 0,
        subtotal: 0,
        threshold: settings.shipping.freeShipping?.threshold?.[currency.toLowerCase()] || 0,
        flatRate: settings.shipping.flatRate[currency.toLowerCase()]
      }
    };
  }

  // חישוב סכום ביניים
  const subtotal = activeItems.reduce((sum, item) => {
    const price = item.price || 0;
    const quantity = item.quantity || 1;
    return sum + (price * quantity);
  }, 0);

  // בדיקת משלוח חינם
  const freeShippingEnabled = settings.shipping.freeShipping?.enabled || false;
  const freeShippingThreshold = settings.shipping.freeShipping?.threshold?.[currency.toLowerCase()] || 0;

  if (freeShippingEnabled && subtotal >= freeShippingThreshold) {
    return {
      shipping: 0,
      freeShipping: true,
      breakdown: {
        activeItems: activeItems.length,
        subtotal,
        threshold: freeShippingThreshold,
        flatRate: settings.shipping.flatRate[currency.toLowerCase()]
      }
    };
  }

  // משלוח רגיל - מחיר קבוע
  return {
    shipping: settings.shipping.flatRate[currency.toLowerCase()],
    freeShipping: false,
    breakdown: {
      activeItems: activeItems.length,
      subtotal,
      threshold: freeShippingThreshold,
      flatRate: settings.shipping.flatRate[currency.toLowerCase()]
    }
  };
}

/**
 * פונקציה סינכרונית לתאימות אחורה
 * משתמשת בברירת מחדל של 49₪
 *
 * @param {Array} items - פריטי ההזמנה
 * @param {string} currency - USD או ILS
 * @returns {number} עלות משלוח
 */
export function calculateShippingSync(items, currency = 'ILS') {
  // סינון פריטים פעילים
  const activeItems = items.filter(item => {
    const isCancelled = item.status === 'cancelled' ||
                       item.itemStatus === 'cancelled' ||
                       item.cancellation?.cancelled === true;
    return !isCancelled;
  });

  // אין פריטים פעילים = אין משלוח
  if (activeItems.length === 0) {
    return 0;
  }

  // ברירת מחדל
  return currency.toUpperCase() === 'ILS' ? 49 : 15;
}

// ============================================
// OLD CODE - DEPRECATED (for backward compatibility)
// קוד ישן - לא בשימוש, נשמר לתאימות אחורה
// ============================================

const SUPPLIER_SHIPPING_RATES = {
  'Amazon': {
    baseCost: 15, // ₪
    freeShippingThreshold: 150, // ₪
    estimatedDays: 14
  },
  'Karl Lagerfeld': {
    baseCost: 30, // ₪
    freeShippingThreshold: 300, // ₪
    estimatedDays: 21
  },
  'Default': {
    baseCost: 20, // ₪
    freeShippingThreshold: 200, // ₪
    estimatedDays: 18
  }
};

/**
 * @deprecated - השתמש ב-calculateShipping() במקום
 * קיבוץ פריטים לפי ספק
 */
export function groupItemsBySupplier(items) {
  console.warn('[DEPRECATED] groupItemsBySupplier is deprecated. Use calculateShipping() instead.');

  if (!items) {
    throw new Error('Items parameter is required');
  }

  if (!Array.isArray(items)) {
    throw new TypeError('Items must be an array');
  }

  if (items.length === 0) {
    return {};
  }

  const supplierGroups = {};

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new TypeError(`Item at index ${index} is invalid`);
    }

    if (typeof item.price !== 'number' || item.price < 0) {
      throw new TypeError(`Item at index ${index} has invalid price: ${item.price}`);
    }

    if (typeof item.quantity !== 'number' || item.quantity < 1) {
      throw new TypeError(`Item at index ${index} has invalid quantity: ${item.quantity}`);
    }

    const supplierName = item.supplierName || 'Default';

    if (!supplierGroups[supplierName]) {
      supplierGroups[supplierName] = {
        supplierName,
        items: [],
        subtotal: 0
      };
    }

    const itemTotal = item.price * item.quantity;
    supplierGroups[supplierName].items.push(item);
    supplierGroups[supplierName].subtotal += itemTotal;
  });

  return supplierGroups;
}

/**
 * @deprecated - השתמש ב-calculateShipping() במקום
 * חישוב עלות משלוח לספק בודד
 */
export function calculateSupplierShipping(supplierName, subtotal) {
  console.warn('[DEPRECATED] calculateSupplierShipping is deprecated. Use calculateShipping() instead.');
  const rates = SUPPLIER_SHIPPING_RATES[supplierName] || SUPPLIER_SHIPPING_RATES['Default'];

  if (subtotal >= rates.freeShippingThreshold) {
    return 0;
  }

  return rates.baseCost;
}

/**
 * @deprecated - השתמש ב-calculateShipping() במקום
 * חישוב עלות משלוח כוללת להזמנה
 */
export function calculateTotalShipping(items) {
  console.warn('[DEPRECATED] calculateTotalShipping is deprecated. Use calculateShipping() instead.');

  if (!items) {
    throw new Error('Items parameter is required for shipping calculation');
  }

  if (!Array.isArray(items)) {
    throw new TypeError('Items must be an array for shipping calculation');
  }

  if (items.length === 0) {
    return {
      total: 0,
      breakdown: []
    };
  }

  try {
    const supplierGroups = groupItemsBySupplier(items);
    let totalShipping = 0;
    const shippingBreakdown = [];

    Object.values(supplierGroups).forEach(group => {
      const shippingCost = calculateSupplierShipping(
        group.supplierName,
        group.subtotal,
        group.items.length
      );

      totalShipping += shippingCost;

      shippingBreakdown.push({
        supplier: group.supplierName,
        itemCount: group.items.length,
        subtotal: group.subtotal,
        shippingCost,
        estimatedDays: (SUPPLIER_SHIPPING_RATES[group.supplierName] || SUPPLIER_SHIPPING_RATES['Default']).estimatedDays
      });
    });

    return {
      total: totalShipping,
      breakdown: shippingBreakdown
    };
  } catch (error) {
    console.error('Error calculating shipping:', error);
    throw new Error(`Failed to calculate shipping: ${error.message}`);
  }
}

/**
 * @deprecated
 * קבלת מידע על ספק
 */
export function getSupplierInfo(supplierName) {
  console.warn('[DEPRECATED] getSupplierInfo is deprecated.');
  return SUPPLIER_SHIPPING_RATES[supplierName] || SUPPLIER_SHIPPING_RATES['Default'];
}

/**
 * @deprecated
 * חישוב זמן אספקה משוער מקסימלי
 */
export function calculateMaxEstimatedDelivery(items) {
  console.warn('[DEPRECATED] calculateMaxEstimatedDelivery is deprecated.');
  const supplierGroups = groupItemsBySupplier(items);
  let maxDays = 0;

  Object.keys(supplierGroups).forEach(supplierName => {
    const info = getSupplierInfo(supplierName);
    if (info.estimatedDays > maxDays) {
      maxDays = info.estimatedDays;
    }
  });

  return maxDays;
}

// ============================================
// EXPORTS
// ============================================

export default {
  // New API (preferred)
  calculateShipping,
  calculateShippingSync,

  // Old API (deprecated, for backward compatibility)
  groupItemsBySupplier,
  calculateSupplierShipping,
  calculateTotalShipping,
  getSupplierInfo,
  calculateMaxEstimatedDelivery,
  SUPPLIER_SHIPPING_RATES
};
