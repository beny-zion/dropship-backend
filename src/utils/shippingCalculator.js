/**
 * Shipping Calculator - Multiple Suppliers Support
 *
 * מחשבון משלוח מתקדם עם תמיכה במספר ספקים
 */

// הגדרות משלוח לפי ספק
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
 * קיבוץ פריטים לפי ספק
 */
export function groupItemsBySupplier(items) {
  // ✅ Validation
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
    // ✅ Validate item structure
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
 * חישוב עלות משלוח לספק בודד
 */
export function calculateSupplierShipping(supplierName, subtotal, itemCount) {
  const rates = SUPPLIER_SHIPPING_RATES[supplierName] || SUPPLIER_SHIPPING_RATES['Default'];

  // אם הסכום עובר את הסף - משלוח חינם
  if (subtotal >= rates.freeShippingThreshold) {
    return 0;
  }

  return rates.baseCost;
}

/**
 * חישוב עלות משלוח כוללת להזמנה
 */
export function calculateTotalShipping(items) {
  // ✅ Validation
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
 * קבלת מידע על ספק
 */
export function getSupplierInfo(supplierName) {
  return SUPPLIER_SHIPPING_RATES[supplierName] || SUPPLIER_SHIPPING_RATES['Default'];
}

/**
 * חישוב זמן אספקה משוער מקסימלי
 */
export function calculateMaxEstimatedDelivery(items) {
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

export default {
  groupItemsBySupplier,
  calculateSupplierShipping,
  calculateTotalShipping,
  getSupplierInfo,
  calculateMaxEstimatedDelivery,
  SUPPLIER_SHIPPING_RATES
};
