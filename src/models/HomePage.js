import mongoose from 'mongoose';

// ============================================
// SUB-SCHEMAS (Component Types)
// ============================================

// 1. Hero Image Schema (Simple responsive hero image without text)
const heroImageSchema = new mongoose.Schema({
  desktopImage: {
    url: String,
    publicId: String,
    alt: String,
    width: Number,
    height: Number
  },
  mobileImage: {
    url: String,
    publicId: String,
    alt: String,
    width: Number,
    height: Number
  },
  link: String,
  openInNewTab: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// 2. Hero Banner Schema
const heroBannerSchema = new mongoose.Schema({
  images: [{
    desktop: {
      url: String,
      publicId: String,
      alt: String
    },
    mobile: {
      url: String,
      publicId: String,
      alt: String
    },
    link: String, // היכן הקליק מוביל
    displayOrder: Number
  }],
  autoplay: {
    enabled: Boolean,
    interval: Number // ms
  },
  overlay: {
    enabled: Boolean,
    color: String, // rgba
    opacity: Number
  },
  text: {
    he: {
      title: String,
      subtitle: String,
      ctaText: String
    },
    en: {
      title: String,
      subtitle: String,
      ctaText: String
    }
  },
  styling: {
    height: String, // '600px', '80vh'
    textPosition: String, // 'center', 'left', 'right'
    textColor: String,
    animation: String // 'fade', 'slide', 'zoom'
  }
}, { _id: false });

// 3. Category Grid Schema
const categoryGridSchema = new mongoose.Schema({
  title: {
    he: String,
    en: String
  },
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  layout: {
    columns: {
      desktop: Number,
      tablet: Number,
      mobile: Number
    },
    gap: String, // '20px'
    cardStyle: String // 'default', 'modern', 'minimal'
  },
  displayMode: {
    type: String,
    enum: ['selected', 'all', 'featured'],
    default: 'selected'
  }
}, { _id: false });

// 4. Product Carousel Schema
const productCarouselSchema = new mongoose.Schema({
  title: {
    he: String,
    en: String
  },
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  productSource: {
    type: String,
    enum: ['manual', 'featured', 'new', 'bestseller', 'category', 'tag', 'brand'],
    default: 'manual'
  },
  categoryFilter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  tagFilter: [{
    type: String,
    lowercase: true
  }],
  brandFilter: String,
  limit: Number,
  layout: {
    itemsPerView: {
      desktop: Number,
      tablet: Number,
      mobile: Number
    },
    spaceBetween: Number,
    navigation: Boolean,
    pagination: Boolean,
    autoplay: Boolean
  }
}, { _id: false });

// 5. Promotional Banner Schema
const promotionalBannerSchema = new mongoose.Schema({
  image: {
    desktop: {
      url: String,
      publicId: String,
      alt: String
    },
    mobile: {
      url: String,
      publicId: String,
      alt: String
    }
  },
  link: String,
  text: {
    he: {
      headline: String,
      subheadline: String,
      cta: String
    },
    en: {
      headline: String,
      subheadline: String,
      cta: String
    }
  },
  styling: {
    backgroundColor: String,
    textColor: String,
    alignment: String, // 'left', 'center', 'right'
    padding: String
  },
  schedule: {
    startDate: Date,
    endDate: Date
  }
}, { _id: false });

// 6. Custom HTML/Component Schema
const customComponentSchema = new mongoose.Schema({
  name: String,
  html: {
    he: String,
    en: String
  },
  css: String,
  javascript: String,
  componentType: {
    type: String,
    enum: ['html', 'react', 'video', 'countdown', 'newsletter'],
    default: 'html'
  }
}, { _id: false });

// ============================================
// MAIN SECTION SCHEMA
// ============================================

const sectionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'hero_image',
      'hero_banner',
      'category_grid',
      'product_carousel',
      'promotional_banner',
      'custom_component',
      'text_block',
      'image_gallery',
      'video_section'
    ],
    required: true
  },

  displayOrder: {
    type: Number,
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  },

  visibility: {
    desktop: { type: Boolean, default: true },
    tablet: { type: Boolean, default: true },
    mobile: { type: Boolean, default: true }
  },

  schedule: {
    enabled: Boolean,
    startDate: Date,
    endDate: Date
  },

  // The actual content based on type
  content: {
    heroImage: heroImageSchema,
    heroBanner: heroBannerSchema,
    categoryGrid: categoryGridSchema,
    productCarousel: productCarouselSchema,
    promotionalBanner: promotionalBannerSchema,
    customComponent: customComponentSchema
  },

  // Styling for the section container
  containerStyling: {
    backgroundColor: String,
    padding: String,
    margin: String,
    maxWidth: String,
    customClass: String
  }
}); // Removed { _id: false } to allow automatic _id generation for sections

// ============================================
// MAIN HOMEPAGE SCHEMA
// ============================================

const homePageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    default: 'Main HomePage'
  },

  isActive: {
    type: Boolean,
    default: true
  },

  language: {
    type: String,
    enum: ['he', 'en', 'both'],
    default: 'both'
  },

  sections: [sectionSchema],

  // Global SEO Settings
  seo: {
    title: {
      he: String,
      en: String
    },
    description: {
      he: String,
      en: String
    },
    keywords: [String],
    ogImage: String
  },

  // Global Styling
  globalStyling: {
    primaryColor: String,
    secondaryColor: String,
    fontFamily: String,
    customCSS: String
  },

  // Analytics & Tracking
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    lastViewed: Date,
    totalClicks: {
      type: Number,
      default: 0
    }
  },

  // Version Control
  version: {
    type: Number,
    default: 1
  },

  publishedAt: Date,

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }

}, {
  timestamps: true
});

// ============================================
// METHODS
// ============================================

// Get active sections sorted by displayOrder
homePageSchema.methods.getActiveSections = function(language = 'he') {
  const now = new Date();

  return this.sections
    .filter(section => {
      if (!section.isActive) return false;

      // Check schedule
      if (section.schedule?.enabled) {
        if (section.schedule.startDate && now < section.schedule.startDate) return false;
        if (section.schedule.endDate && now > section.schedule.endDate) return false;
      }

      return true;
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
};

// Increment views
homePageSchema.methods.incrementViews = function() {
  this.analytics.views += 1;
  this.analytics.lastViewed = new Date();
  return this.save();
};

// Clone for A/B testing
homePageSchema.methods.clone = function(newName) {
  const cloned = this.toObject();
  delete cloned._id;
  delete cloned.createdAt;
  delete cloned.updatedAt;
  cloned.name = newName;
  cloned.isActive = false;
  cloned.version += 1;

  return new HomePage(cloned);
};

// ============================================
// STATICS
// ============================================

homePageSchema.statics.getActiveHomePage = function(language = 'both') {
  // Query either exact language match OR 'both'
  return this.findOne({
    isActive: true,
    $or: [
      { language: language },
      { language: 'both' }
    ]
  })
    .populate('sections.content.categoryGrid.categories')
    .populate('sections.content.productCarousel.products')
    .populate('sections.content.productCarousel.categoryFilter');
};

// ============================================
// INDEXES
// ============================================

homePageSchema.index({ isActive: 1, language: 1 });
homePageSchema.index({ 'sections.displayOrder': 1 });
homePageSchema.index({ createdAt: -1 });

const HomePage = mongoose.model('HomePage', homePageSchema);

export default HomePage;
