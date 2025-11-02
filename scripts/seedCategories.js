import mongoose from 'mongoose';
import dotenv from 'dotenv';
import slugify from 'slugify';
import Category from '../src/models/Category.js';

dotenv.config();

// Sample categories data
const categories = [
  {
    name: {
      he: 'אלקטרוניקה',
      en: 'Electronics'
    },
    slug: 'electronics',
    description: {
      he: 'המוצרים האלקטרוניים הטובים ביותר - סמארטפונים, מחשבים, אוזניות ועוד',
      en: 'Best electronics - smartphones, computers, headphones and more'
    },
    promotionalText: {
      he: '🔥 טכנולוגיה מתקדמת במחירים הזולים בישראל!',
      en: '🔥 Advanced technology at the best prices!'
    },
    mainImage: {
      url: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800',
      alt: 'אלקטרוניקה'
    },
    styling: {
      backgroundColor: '#1E3A8A',
      textColor: '#FFFFFF',
      gradientColors: ['rgba(30, 58, 138, 0.9)', 'rgba(59, 130, 246, 0.5)']
    },
    displayOrder: 1,
    isActive: true,
    seo: {
      metaTitle: {
        he: 'אלקטרוניקה - שופינג סמארט',
        en: 'Electronics - Shopping Smart'
      },
      metaDescription: {
        he: 'מוצרי אלקטרוניקה מובילים מאמזון במחירים הכי טובים',
        en: 'Leading electronics from Amazon at the best prices'
      },
      keywords: ['אלקטרוניקה', 'סמארטפון', 'מחשב', 'אוזניות']
    }
  },
  {
    name: {
      he: 'אופנה וביגוד',
      en: 'Fashion & Clothing'
    },
    slug: 'fashion',
    description: {
      he: 'אופנה עדכנית לכל המשפחה - בגדים, נעליים, אקססוריז',
      en: 'Latest fashion for the whole family'
    },
    promotionalText: {
      he: '👗 הקולקציה החדשה כבר כאן!',
      en: '👗 New collection is here!'
    },
    mainImage: {
      url: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=800',
      alt: 'אופנה וביגוד'
    },
    styling: {
      backgroundColor: '#EC4899',
      textColor: '#FFFFFF',
      gradientColors: ['rgba(236, 72, 153, 0.9)', 'rgba(244, 114, 182, 0.5)']
    },
    displayOrder: 2,
    isActive: true,
    seo: {
      metaTitle: {
        he: 'אופנה וביגוד - שופינג סמארט',
        en: 'Fashion & Clothing - Shopping Smart'
      },
      metaDescription: {
        he: 'אופנה עדכנית מהמותגים המובילים',
        en: 'Latest fashion from leading brands'
      },
      keywords: ['אופנה', 'ביגוד', 'נעליים', 'אקססוריז']
    }
  },
  {
    name: {
      he: 'בית וגינה',
      en: 'Home & Garden'
    },
    slug: 'home-garden',
    description: {
      he: 'כל מה שצריך לבית ולגינה - ריהוט, קישוטים, כלי מטבח',
      en: 'Everything for home and garden'
    },
    promotionalText: {
      he: '🏠 הופכים את הבית לגן עדן!',
      en: '🏠 Turn your house into a home!'
    },
    mainImage: {
      url: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800',
      alt: 'בית וגינה'
    },
    styling: {
      backgroundColor: '#059669',
      textColor: '#FFFFFF',
      gradientColors: ['rgba(5, 150, 105, 0.9)', 'rgba(16, 185, 129, 0.5)']
    },
    displayOrder: 3,
    isActive: true,
    seo: {
      metaTitle: {
        he: 'בית וגינה - שופינג סמארט',
        en: 'Home & Garden - Shopping Smart'
      },
      metaDescription: {
        he: 'מוצרים לבית ולגינה במחירים מעולים',
        en: 'Home and garden products at great prices'
      },
      keywords: ['בית', 'גינה', 'ריהוט', 'קישוטים']
    }
  },
  {
    name: {
      he: 'צעצועים ותינוקות',
      en: 'Toys & Baby'
    },
    slug: 'toys-baby',
    description: {
      he: 'צעצועים ומוצרי תינוקות איכותיים ובטוחים',
      en: 'Quality and safe toys and baby products'
    },
    promotionalText: {
      he: '🧸 הכי טוב לילדים שלכם!',
      en: '🧸 Best for your kids!'
    },
    mainImage: {
      url: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800',
      alt: 'צעצועים ותינוקות'
    },
    styling: {
      backgroundColor: '#F59E0B',
      textColor: '#FFFFFF',
      gradientColors: ['rgba(245, 158, 11, 0.9)', 'rgba(251, 191, 36, 0.5)']
    },
    displayOrder: 4,
    isActive: true,
    seo: {
      metaTitle: {
        he: 'צעצועים ותינוקות - שופינג סמארט',
        en: 'Toys & Baby - Shopping Smart'
      },
      metaDescription: {
        he: 'צעצועים ומוצרי תינוקות איכותיים',
        en: 'Quality toys and baby products'
      },
      keywords: ['צעצועים', 'תינוקות', 'משחקים', 'ילדים']
    }
  },
  {
    name: {
      he: 'ספורט וחוץ',
      en: 'Sports & Outdoors'
    },
    slug: 'sports-outdoors',
    description: {
      he: 'ציוד ספורט ופעילות חוץ לכל המשפחה',
      en: 'Sports and outdoor equipment for the whole family'
    },
    promotionalText: {
      he: '⚽ בואו להתאמן איתנו!',
      en: '⚽ Come train with us!'
    },
    mainImage: {
      url: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800',
      alt: 'ספורט וחוץ'
    },
    styling: {
      backgroundColor: '#7C3AED',
      textColor: '#FFFFFF',
      gradientColors: ['rgba(124, 58, 237, 0.9)', 'rgba(167, 139, 250, 0.5)']
    },
    displayOrder: 5,
    isActive: true,
    seo: {
      metaTitle: {
        he: 'ספורט וחוץ - שופינג סמארט',
        en: 'Sports & Outdoors - Shopping Smart'
      },
      metaDescription: {
        he: 'ציוד ספורט ופעילות חוץ איכותי',
        en: 'Quality sports and outdoor equipment'
      },
      keywords: ['ספורט', 'חוץ', 'ריצה', 'כושר']
    }
  },
  {
    name: {
      he: 'יופי ובריאות',
      en: 'Beauty & Health'
    },
    slug: 'beauty-health',
    description: {
      he: 'מוצרי יופי, טיפוח ובריאות מהמותגים הטובים בעולם',
      en: 'Beauty, care and health products from the best brands'
    },
    promotionalText: {
      he: '✨ תראו ותרגישו מעולה!',
      en: '✨ Look and feel great!'
    },
    mainImage: {
      url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800',
      alt: 'יופי ובריאות'
    },
    styling: {
      backgroundColor: '#DB2777',
      textColor: '#FFFFFF',
      gradientColors: ['rgba(219, 39, 119, 0.9)', 'rgba(236, 72, 153, 0.5)']
    },
    displayOrder: 6,
    isActive: true,
    seo: {
      metaTitle: {
        he: 'יופי ובריאות - שופינג סמארט',
        en: 'Beauty & Health - Shopping Smart'
      },
      metaDescription: {
        he: 'מוצרי יופי וטיפוח מהמותגים המובילים',
        en: 'Beauty and care products from leading brands'
      },
      keywords: ['יופי', 'בריאות', 'טיפוח', 'קוסמטיקה']
    }
  }
];

async function seedCategories() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing categories
    await Category.deleteMany({});
    console.log('🗑️  Cleared existing categories');

    // Insert new categories
    const createdCategories = await Category.insertMany(categories);
    console.log(`✅ Created ${createdCategories.length} categories`);

    // Display created categories
    console.log('\n📊 Created Categories:');
    createdCategories.forEach((cat, index) => {
      console.log(`${index + 1}. ${cat.name.he} (${cat.slug})`);
    });

    console.log('\n✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    process.exit(1);
  }
}

seedCategories();
