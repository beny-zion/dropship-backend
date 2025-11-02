import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      he: {
        type: String,
        required: [true, 'שם הקטגוריה בעברית הוא שדה חובה'],
        trim: true,
      },
      en: {
        type: String,
        required: [true, 'Category name in English is required'],
        trim: true,
      },
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    description: {
      he: {
        type: String,
        trim: true,
      },
      en: {
        type: String,
        trim: true,
      },
    },
    // תמונה ראשית לתצוגה רגילה
    mainImage: {
      url: {
        type: String,
        required: [true, 'תמונה ראשית היא שדה חובה'],
      },
      publicId: String, // For Cloudinary
      alt: String,
    },
    // תמונה/GIF/וידאו פרסומי לדף הבית
    promotionalMedia: {
      type: {
        type: String,
        enum: ['image', 'gif', 'video'],
        default: 'image',
      },
      url: String,
      publicId: String, // For Cloudinary
      alt: String,
      thumbnail: String, // For video thumbnails
    },
    // טקסט פרסומי לדף הבית
    promotionalText: {
      he: {
        type: String,
        trim: true,
      },
      en: {
        type: String,
        trim: true,
      },
    },
    // עיצוב הכרטיסייה
    styling: {
      backgroundColor: {
        type: String,
        default: '#ffffff',
      },
      textColor: {
        type: String,
        default: '#000000',
      },
      gradientColors: [String], // For gradient backgrounds
    },
    // סדר תצוגה (נמוך יותר = מוצג קודם)
    displayOrder: {
      type: Number,
      default: 0,
    },
    // סטטוס
    isActive: {
      type: Boolean,
      default: true,
    },
    // תאריכי תוקף (למבצעים עונתיים)
    validFrom: {
      type: Date,
      default: null,
    },
    validTo: {
      type: Date,
      default: null,
    },
    // מטא-דאטה לSEO
    seo: {
      metaTitle: {
        he: String,
        en: String,
      },
      metaDescription: {
        he: String,
        en: String,
      },
      keywords: [String],
    },
    // סטטיסטיקות
    stats: {
      views: {
        type: Number,
        default: 0,
      },
      clicks: {
        type: Number,
        default: 0,
      },
      lastViewed: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
// Note: slug index is created automatically by unique: true
categorySchema.index({ displayOrder: 1, isActive: 1 });
categorySchema.index({ isActive: 1, validFrom: 1, validTo: 1 });

// Virtual for checking if category is currently valid
categorySchema.virtual('isCurrentlyValid').get(function () {
  const now = new Date();
  if (!this.isActive) return false;
  if (this.validFrom && now < this.validFrom) return false;
  if (this.validTo && now > this.validTo) return false;
  return true;
});

// Method to increment view count
categorySchema.methods.incrementViews = async function () {
  this.stats.views += 1;
  this.stats.lastViewed = new Date();
  return this.save();
};

// Method to increment click count
categorySchema.methods.incrementClicks = async function () {
  this.stats.clicks += 1;
  return this.save();
};

// Static method to get active categories
categorySchema.statics.getActiveCategories = function () {
  const now = new Date();
  return this.find({
    isActive: true,
    $or: [
      { validFrom: { $exists: false } },
      { validFrom: null, validTo: null },
      { validFrom: { $lte: now }, validTo: { $gte: now } },
      { validFrom: { $lte: now }, validTo: null },
      { validFrom: null, validTo: { $gte: now } },
    ],
  }).sort({ displayOrder: 1 });
};

const Category = mongoose.model('Category', categorySchema);

export default Category;
