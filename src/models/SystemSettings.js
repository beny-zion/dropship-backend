/**
 * System Settings Model
 *
 * הגדרות מערכת גלובליות - Singleton Pattern
 * מסמך יחיד במסד הנתונים עם _id קבוע
 */

import mongoose from 'mongoose';
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS } from '../utils/cache.js';

const systemSettingsSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: 'system-settings'
  },

  // הגדרות משלוח
  shipping: {
    flatRate: {
      usd: {
        type: Number,
        default: 15,
        min: 0,
        required: true
      },
      ils: {
        type: Number,
        default: 49,
        min: 0,
        required: true
      }
    },
    estimatedDays: {
      type: Number,
      default: 14,
      min: 1
    },
    freeShipping: {
      enabled: {
        type: Boolean,
        default: false
      },
      threshold: {
        usd: {
          type: Number,
          default: 0,
          min: 0
        },
        ils: {
          type: Number,
          default: 0,
          min: 0
        }
      }
    }
  },

  // הגדרות הזמנה
  order: {
    minimumAmount: {
      usd: {
        type: Number,
        default: 0,
        min: 0
      },
      ils: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    minimumItemsCount: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  // הגדרות מייל
  email: {
    notifications: {
      enabled: {
        type: Boolean,
        default: true
      },
      adminEmail: {
        type: String,
        default: ''
      },
      fromName: {
        type: String,
        default: 'TORINO'
      }
    }
  },

  // הגדרות כלליות
  general: {
    siteName: {
      type: String,
      default: 'TORINO'
    },
    currency: {
      type: String,
      enum: ['USD', 'ILS', 'BOTH'],
      default: 'BOTH'
    },
    timezone: {
      type: String,
      default: 'Asia/Jerusalem'
    }
  },

  // הגדרות תמחור דינמי (Inventory Pricing Engine)
  pricing: {
    usdToIls: {
      type: Number,
      default: 3.2,
      min: 1
    },
    multipliers: {
      tier1: {
        maxPrice: { type: Number, default: 50 },
        multiplier: { type: Number, default: 2.0 }
      },
      tier2: {
        maxPrice: { type: Number, default: 99 },
        multiplier: { type: Number, default: 1.9 }
      },
      tier3: {
        multiplier: { type: Number, default: 1.8 }
      }
    }
  },

  // מטא דאטה
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// ⚡ SCALE FIX: Cache system settings to reduce DB queries
// Old: Every cart/order request = 1 DB query (1000 users = 1000 queries/sec)
// New: First request = 1 DB query, rest = instant from cache (10 minutes TTL)
systemSettingsSchema.statics.getSettings = async function() {
  try {
    // Check cache first
    const cacheKey = CACHE_KEYS.SYSTEM_SETTINGS || 'settings:system';
    const cached = cacheGet(cacheKey);

    if (cached) {
      return cached; // ⚡ Cache hit - instant response!
    }

    // Cache miss - fetch from DB
    let settings = await this.findById('system-settings');

    if (!settings) {
      // צור הגדרות דיפולט אם לא קיימות
      console.log('[SystemSettings] Creating default settings...');
      settings = new this({
        _id: 'system-settings',
        shipping: {
          flatRate: { usd: 15, ils: 49 },
          estimatedDays: 14
        },
        order: {
          minimumAmount: { usd: 0, ils: 0 },
          minimumItemsCount: 0
        }
      });
      await settings.save();
      console.log('[SystemSettings] ✅ Created default settings successfully');
    }

    // Store in cache for 10 minutes (600 seconds)
    // Settings rarely change, so long TTL is safe
    cacheSet(cacheKey, settings, 600);

    return settings;
  } catch (error) {
    console.error('[SystemSettings] ❌ Error in getSettings:', error);
    throw error;
  }
};

// ✅ Static method: Update settings
systemSettingsSchema.statics.updateSettings = async function(updates, userId = null) {
  const settings = await this.getSettings();

  // עדכן רק את השדות שסופקו
  if (updates.shipping) {
    if (updates.shipping.flatRate) {
      if (updates.shipping.flatRate.usd !== undefined) {
        settings.shipping.flatRate.usd = updates.shipping.flatRate.usd;
      }
      if (updates.shipping.flatRate.ils !== undefined) {
        settings.shipping.flatRate.ils = updates.shipping.flatRate.ils;
      }
    }
    if (updates.shipping.estimatedDays !== undefined) {
      settings.shipping.estimatedDays = updates.shipping.estimatedDays;
    }
    if (updates.shipping.freeShipping) {
      if (updates.shipping.freeShipping.enabled !== undefined) {
        settings.shipping.freeShipping.enabled = updates.shipping.freeShipping.enabled;
      }
      if (updates.shipping.freeShipping.threshold) {
        if (updates.shipping.freeShipping.threshold.usd !== undefined) {
          settings.shipping.freeShipping.threshold.usd = updates.shipping.freeShipping.threshold.usd;
        }
        if (updates.shipping.freeShipping.threshold.ils !== undefined) {
          settings.shipping.freeShipping.threshold.ils = updates.shipping.freeShipping.threshold.ils;
        }
      }
    }
  }

  if (updates.order) {
    if (updates.order.minimumAmount) {
      if (updates.order.minimumAmount.usd !== undefined) {
        settings.order.minimumAmount.usd = updates.order.minimumAmount.usd;
      }
      if (updates.order.minimumAmount.ils !== undefined) {
        settings.order.minimumAmount.ils = updates.order.minimumAmount.ils;
      }
    }
    if (updates.order.minimumItemsCount !== undefined) {
      settings.order.minimumItemsCount = updates.order.minimumItemsCount;
    }
  }

  if (updates.email) {
    if (updates.email.notifications) {
      Object.assign(settings.email.notifications, updates.email.notifications);
    }
  }

  if (updates.general) {
    Object.assign(settings.general, updates.general);
  }

  // עדכון הגדרות תמחור
  if (updates.pricing) {
    if (!settings.pricing) {
      settings.pricing = {
        usdToIls: 3.2,
        multipliers: {
          tier1: { maxPrice: 50, multiplier: 2.0 },
          tier2: { maxPrice: 99, multiplier: 1.9 },
          tier3: { multiplier: 1.8 }
        }
      };
    }

    if (updates.pricing.usdToIls !== undefined) {
      settings.pricing.usdToIls = updates.pricing.usdToIls;
    }

    if (updates.pricing.multipliers) {
      if (updates.pricing.multipliers.tier1) {
        Object.assign(settings.pricing.multipliers.tier1, updates.pricing.multipliers.tier1);
      }
      if (updates.pricing.multipliers.tier2) {
        Object.assign(settings.pricing.multipliers.tier2, updates.pricing.multipliers.tier2);
      }
      if (updates.pricing.multipliers.tier3) {
        Object.assign(settings.pricing.multipliers.tier3, updates.pricing.multipliers.tier3);
      }
    }
  }

  settings.lastUpdated = new Date();
  if (userId) {
    settings.updatedBy = userId;
  }

  await settings.save();

  // ⚡ IMPORTANT: Invalidate cache when settings change
  const cacheKey = CACHE_KEYS.SYSTEM_SETTINGS || 'settings:system';
  cacheDel(cacheKey);
  console.log('[SystemSettings] Settings updated successfully + cache invalidated');

  return settings;
};

// ✅ Instance method: Get shipping rate by currency
systemSettingsSchema.methods.getShippingRate = function(currency = 'USD') {
  const curr = currency.toUpperCase();
  if (curr === 'ILS') {
    return this.shipping.flatRate.ils;
  }
  return this.shipping.flatRate.usd;
};

// ✅ Instance method: Check if minimum order amount is met
systemSettingsSchema.methods.isMinimumAmountMet = function(amount, currency = 'USD') {
  const curr = currency.toUpperCase();
  const minimumAmount = curr === 'ILS'
    ? this.order.minimumAmount.ils
    : this.order.minimumAmount.usd;

  return amount >= minimumAmount;
};

// ✅ Instance method: Calculate sell price from USD cost
systemSettingsSchema.methods.calculateSellPrice = function(usdCost) {
  const pricing = this.pricing || {
    usdToIls: 3.2,
    multipliers: {
      tier1: { maxPrice: 50, multiplier: 2.0 },
      tier2: { maxPrice: 99, multiplier: 1.9 },
      tier3: { multiplier: 1.8 }
    }
  };

  let multiplier;
  if (usdCost <= pricing.multipliers.tier1.maxPrice) {
    multiplier = pricing.multipliers.tier1.multiplier;
  } else if (usdCost <= pricing.multipliers.tier2.maxPrice) {
    multiplier = pricing.multipliers.tier2.multiplier;
  } else {
    multiplier = pricing.multipliers.tier3.multiplier;
  }

  const sellPriceUsd = Math.round(usdCost * multiplier * 100) / 100;
  const sellPriceIls = Math.round(sellPriceUsd * pricing.usdToIls);

  return {
    usdCost,
    multiplier,
    sellPriceUsd,
    sellPriceIls,
    usdToIls: pricing.usdToIls
  };
};

// ✅ Instance method: Get pricing config (for frontend)
systemSettingsSchema.methods.getPricingConfig = function() {
  return this.pricing || {
    usdToIls: 3.2,
    multipliers: {
      tier1: { maxPrice: 50, multiplier: 2.0 },
      tier2: { maxPrice: 99, multiplier: 1.9 },
      tier3: { multiplier: 1.8 }
    }
  };
};

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

export default SystemSettings;
