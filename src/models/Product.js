import mongoose from 'mongoose';
import slugify from 'slugify';

const productSchema = new mongoose.Schema({
  // מידע בסיסי
  asin: {
    type: String,
    required: [true, 'נדרש ASIN של המוצר'],
    unique: true,
    uppercase: true,
    trim: true
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
    type: String,
    required: [true, 'נדרשת קטגוריה'],
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
  
  // תמונות
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
  
  // פרטים טכניים
  specifications: {
    brand: String,
    model: String,
    color: String,
    size: String,
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
      required: false
    },
    affiliateUrl: String
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
});

// יצירת slug אוטומטית
productSchema.pre('save', function(next) {
  if (this.isModified('name_he')) {
    this.slug = slugify(this.name_he, {
      lower: true,
      strict: true,
      locale: 'he'
    }) + '-' + this.asin.toLowerCase();
  }
  next();
});

// עדכון updatedAt
productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// אינדקסים
productSchema.index({ asin: 1 });
productSchema.index({ slug: 1 });
productSchema.index({ category: 1 });
productSchema.index({ 'price.ils': 1 });
productSchema.index({ 'rating.average': -1 });
productSchema.index({ featured: -1, createdAt: -1 });
productSchema.index({ name_he: 'text', description_he: 'text' });

const Product = mongoose.model('Product', productSchema);

export default Product;