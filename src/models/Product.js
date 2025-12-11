import mongoose from 'mongoose';
import slugify from 'slugify';

const productSchema = new mongoose.Schema({
  // מידע בסיסי
  asin: {
    type: String,
    required: false, // אופציונלי - רק למוצרי אמזון
    uppercase: true,
    trim: true,
    default: undefined // מחיקה של ערכים ריקים
  },
  
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  
  // שמות ותיאורים
  name_he: {
    type: String,
    required: [true, 'נדרש שם המוצר בעברית'],
    trim: true
  },
  
  name_en: {
    type: String,
    trim: true
  },
  
  description_he: {
    type: String,
    required: [true, 'נדרש תיאור המוצר בעברית']
  },
  
  description_en: {
    type: String
  },
  
  // מחירים
  price: {
    usd: {
      type: Number,
      required: [true, 'נדרש מחיר ב-USD']
    },
    ils: {
      type: Number,
      required: [true, 'נדרש מחיר ב-ILS']
    }
  },
  
  originalPrice: {
    usd: Number,
    ils: Number
  },
  
  discount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  // פירוט עלויות (Dropshipping Cost Breakdown)
  costBreakdown: {
    baseCost: {
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
    taxPercent: {
      type: Number,
      default: 18, // מע"ם ישראלי
      min: 0,
      max: 100
    },
    shippingCost: {
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
    additionalFees: {
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
    profitMargin: {
      type: Number,
      default: 0,
      min: 0
    },
    notes: String // הערות על העלויות
  },

  // מלאי ומשלוח (מותאם ל-Dropshipping)
  stock: {
    available: {
      type: Boolean,
      default: true
    },
    quantity: {
      type: Number,
      default: null // null = מלאי לא מוגבל/לא רלוונטי
    },
    trackInventory: {
      type: Boolean,
      default: false // האם לעקוב אחרי מלאי או לא
    },
    lowStockThreshold: {
      type: Number,
      default: 5
    },
    lastChecked: {
      type: Date,
      default: Date.now
    }
  },
  
  shipping: {
    freeShipping: {
      type: Boolean,
      default: false
    },
    estimatedDays: {
      type: Number,
      default: 14
    },
    cost: {
      type: Number,
      default: 0
    }
  },
  
  // קטגוריה ותגיות
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'חובה לבחור קטגוריה למוצר']
  },

  // שדה מחרוזת ישן לתאימות לאחור (deprecated)
  categoryLegacy: {
    type: String,
    enum: [
      'electronics',
      'fashion',
      'home',
      'sports',
      'toys',
      'books',
      'beauty',
      'automotive',
      'grocery',
      'other'
    ]
  },
  
  subcategory: String,
  
  tags: [{
    type: String,
    lowercase: true
  }],
  
  // תמונות (תמונות כלליות של המוצר)
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],

  // ווריאנטים (צבעים, מידות, וכו')
  variants: [{
    sku: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true
    },
    color: {
      type: String,
      trim: true
    },
    size: {
      type: String,
      trim: true
    },
    images: [{
      url: {
        type: String,
        required: true
      },
      alt: String,
      isPrimary: {
        type: Boolean,
        default: false
      }
    }],
    stock: {
      available: {
        type: Boolean,
        default: true
      },
      quantity: {
        type: Number,
        default: null
      }
    },
    additionalCost: {
      usd: {
        type: Number,
        default: 0
      },
      ils: {
        type: Number,
        default: 0
      }
    },
    supplierLink: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/.+\..+/.test(v);
        },
        message: 'קישור ספק חייב להיות URL תקין'
      }
    },
    barcode: String,
    weight: String
  }],

  // פרטים טכניים (כלליים למוצר)
  specifications: {
    brand: String,
    model: String,
    weight: String,
    dimensions: String,
    material: String
  },
  
  features: [String],
  
  // דירוגים וביקורות
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    },
    amazonRating: Number,
    amazonReviewsCount: Number
  },
  
  // SEO
  seo: {
    title: String,
    description: String,
    keywords: [String]
  },
  
  // קישורים
  links: {
    amazon: {
      type: String,
      required: false,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/.+\..+/.test(v);
        },
        message: 'קישור אמזון חייב להיות URL תקין'
      }
    },
    affiliateUrl: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/.+\..+/.test(v);
        },
        message: 'קישור affiliate חייב להיות URL תקין'
      }
    },
    supplierUrl: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/.+\..+/.test(v);
        },
        message: 'קישור ספק חייב להיות URL תקין'
      }
    }
  },

  // פרטי ספק
  supplier: {
    name: {
      type: String,
      default: 'Amazon'
    },
    url: String,
    notes: String // הערות על הספק, תנאי תשלום, זמן אספקה וכו'
  },
  
  // סטטוס
  status: {
    type: String,
    enum: ['active', 'inactive', 'out_of_stock', 'discontinued'],
    default: 'active'
  },
  
  featured: {
    type: Boolean,
    default: false
  },
  
  // סטטיסטיקות
  stats: {
    views: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    sales: {
      type: Number,
      default: 0
    }
  },
  
  // תאריכים
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  lastSyncedAt: Date
}, {
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      // Always use _id timestamp as fallback for all dates
      const fallbackDate = doc._id.getTimestamp().toISOString();

      // Fix createdAt
      if (doc.createdAt instanceof Date) {
        ret.createdAt = doc.createdAt.toISOString();
      } else {
        ret.createdAt = fallbackDate;
      }

      // Fix updatedAt
      if (doc.updatedAt instanceof Date) {
        ret.updatedAt = doc.updatedAt.toISOString();
      } else {
        ret.updatedAt = fallbackDate;
      }

      // Fix lastSyncedAt
      if (doc.lastSyncedAt instanceof Date) {
        ret.lastSyncedAt = doc.lastSyncedAt.toISOString();
      } else if (ret.lastSyncedAt) {
        ret.lastSyncedAt = fallbackDate;
      }

      return ret;
    }
  },
  toObject: { virtuals: true }
});

// ניקוי ASIN ריק לפני שמירה
productSchema.pre('save', function(next) {
  // אם ASIN הוא מחרוזת ריקה, מחק אותו לגמרי
  if (this.asin === '' || this.asin === null) {
    this.asin = undefined;
  }
  next();
});

// יצירת slug אוטומטית
productSchema.pre('save', function(next) {
  if (this.isModified('name_he')) {
    const baseSlug = slugify(this.name_he, {
      lower: true,
      strict: true,
      locale: 'he'
    });
    // אם יש ASIN, השתמש בו. אחרת, השתמש ב-_id
    const uniquePart = this.asin ? this.asin.toLowerCase() : this._id.toString().slice(-6);
    this.slug = `${baseSlug}-${uniquePart}`;
  }
  next();
});

// עדכון updatedAt
productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// אינדקסים
productSchema.index(
  { asin: 1 },
  {
    unique: true,
    partialFilterExpression: { asin: { $type: 'string', $gt: '' } }
  }
);
// slug index is created automatically by unique: true in schema
productSchema.index({ category: 1 });
productSchema.index({ 'price.ils': 1 });
productSchema.index({ 'rating.average': -1 });
productSchema.index({ featured: -1, createdAt: -1 });
productSchema.index({ name_he: 'text', description_he: 'text' });

const Product = mongoose.model('Product', productSchema);

export default Product;