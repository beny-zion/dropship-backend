import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.js';

dotenv.config();

const products = [
  {
    asin: 'B08N5WRWNW',
    name_he: 'תיק גב חכם עם טעינת USB',
    name_en: 'Smart Backpack with USB Charging',
    description_he: 'תיק גב איכותי למחשב נייד עד 15.6 אינץ׳, עם יציאת USB מובנית לטעינת מכשירים. עשוי מחומרים עמידים למים, עם תאים מרופדים להגנה על המחשב והציוד האלקטרוני.',
    description_en: 'Premium laptop backpack up to 15.6", with built-in USB charging port.',
    price: {
      usd: 39.99,
      ils: 146
    },
    originalPrice: {
      usd: 59.99,
      ils: 219
    },
    discount: 33,
    stock: {
      available: true,
      quantity: 50
    },
    shipping: {
      freeShipping: true,
      estimatedDays: 12,
      cost: 0
    },
    category: 'fashion',
    subcategory: 'bags',
    tags: ['תיק גב', 'מחשב נייד', 'טעינה', 'נסיעות'],
    images: [
      {
        url: 'https://m.media-amazon.com/images/I/71BK0YTKXPL._AC_SL1500_.jpg',
        alt: 'תיק גב חכם - מבט קדמי',
        isPrimary: true
      },
      {
        url: 'https://m.media-amazon.com/images/I/71qid1MTESL._AC_SL1500_.jpg',
        alt: 'תיק גב חכם - מבט צד'
      }
    ],
    specifications: {
      brand: 'TravelPro',
      color: 'שחור',
      size: '15.6 אינץ׳',
      weight: '0.8 ק״ג',
      dimensions: '45 x 30 x 15 ס״מ',
      material: 'פוליאסטר עמיד למים'
    },
    features: [
      'יציאת USB מובנית לטעינה',
      'תא מרופד למחשב נייד',
      'עמיד למים',
      'רצועות כתפיים מרופדות',
      'תא נסתר נגד כיס',
      'עיצוב ארגונומי'
    ],
    rating: {
      average: 4.5,
      count: 1250,
      amazonRating: 4.5,
      amazonReviewsCount: 1250
    },
    links: {
      amazon: 'https://www.amazon.com/dp/B08N5WRWNW',
      affiliateUrl: 'https://www.amazon.com/dp/B08N5WRWNW?tag=yourstore-20'
    },
    status: 'active',
    featured: true
  },
  {
    asin: 'B09V3KXJPB',
    name_he: 'אוזניות Bluetooth מבטלות רעש',
    name_en: 'Wireless Noise Cancelling Headphones',
    description_he: 'אוזניות אלחוטיות איכותיות עם טכנולוגיית ביטול רעש אקטיבי (ANC). סוללה עד 30 שעות, איכות צליל מעולה, נוחות מקסימלית לשימוש ממושך. תואם לכל המכשירים.',
    description_en: 'Premium wireless headphones with Active Noise Cancellation (ANC).',
    price: {
      usd: 79.99,
      ils: 292
    },
    originalPrice: {
      usd: 129.99,
      ils: 474
    },
    discount: 38,
    stock: {
      available: true,
      quantity: 30
    },
    shipping: {
      freeShipping: true,
      estimatedDays: 10,
      cost: 0
    },
    category: 'electronics',
    subcategory: 'audio',
    tags: ['אוזניות', 'bluetooth', 'ביטול רעש', 'אלחוטי'],
    images: [
      {
        url: 'https://m.media-amazon.com/images/I/61aXNNGqjIL._AC_SL1500_.jpg',
        alt: 'אוזניות Bluetooth',
        isPrimary: true
      },
      {
        url: 'https://m.media-amazon.com/images/I/71GYvKJ+VJL._AC_SL1500_.jpg',
        alt: 'אוזניות - מבט צד'
      }
    ],
    specifications: {
      brand: 'SoundMax',
      color: 'שחור',
      weight: '0.25 ק״ג',
      material: 'פלסטיק איכותי ומתכת'
    },
    features: [
      'ביטול רעש אקטיבי (ANC)',
      'סוללה עד 30 שעות',
      'Bluetooth 5.0',
      'מיקרופון מובנה',
      'קיפול קומפקטי',
      'כריות אוזן רכות'
    ],
    rating: {
      average: 4.3,
      count: 890,
      amazonRating: 4.3,
      amazonReviewsCount: 890
    },
    links: {
      amazon: 'https://www.amazon.com/dp/B09V3KXJPB',
      affiliateUrl: 'https://www.amazon.com/dp/B09V3KXJPB?tag=yourstore-20'
    },
    status: 'active',
    featured: true
  },
  {
    asin: 'B0BDK62PDX',
    name_he: 'בקבוק תרמי נירוסטה 1 ליטר',
    name_en: 'Stainless Steel Thermal Bottle 1L',
    description_he: 'בקבוק תרמי איכותי שומר חום וקור עד 24 שעות. עשוי נירוסטה 304 ללא BPA, פקק אטום למניעת דליפות. מושלם לספורט, עבודה ונסיעות.',
    description_en: 'Premium thermal bottle keeps hot/cold for 24 hours.',
    price: {
      usd: 24.99,
      ils: 91
    },
    stock: {
      available: true,
      quantity: 100
    },
    shipping: {
      freeShipping: false,
      estimatedDays: 14,
      cost: 15
    },
    category: 'home',
    subcategory: 'kitchen',
    tags: ['בקבוק', 'תרמי', 'ספורט', 'נסיעות'],
    images: [
      {
        url: 'https://m.media-amazon.com/images/I/61YfnqkO6uL._AC_SL1500_.jpg',
        alt: 'בקבוק תרמי',
        isPrimary: true
      }
    ],
    specifications: {
      brand: 'HydroFlask',
      color: 'כחול',
      size: '1 ליטר',
      weight: '0.4 ק״ג',
      material: 'נירוסטה 304'
    },
    features: [
      'שומר חום/קור 24 שעות',
      'נירוסטה איכותית',
      'ללא BPA',
      'פקק אטום',
      'קל לניקוי',
      'עיצוב אלגנטי'
    ],
    rating: {
      average: 4.7,
      count: 2340,
      amazonRating: 4.7,
      amazonReviewsCount: 2340
    },
    links: {
      amazon: 'https://www.amazon.com/dp/B0BDK62PDX',
      affiliateUrl: 'https://www.amazon.com/dp/B0BDK62PDX?tag=yourstore-20'
    },
    status: 'active',
    featured: false
  },
  {
    asin: 'B08XY9JKLM',
    name_he: 'מטען אלחוטי מהיר 15W',
    name_en: 'Fast Wireless Charger 15W',
    description_he: 'מטען אלחוטי מהיר תואם לכל מכשירי iPhone ו-Android. טעינה מהירה עד 15W, עיצוב דק ומינימליסטי, הגנת יתר מובנית.',
    description_en: 'Fast wireless charger compatible with all devices.',
    price: {
      usd: 19.99,
      ils: 73
    },
    originalPrice: {
      usd: 29.99,
      ils: 110
    },
    discount: 33,
    stock: {
      available: true,
      quantity: 80
    },
    shipping: {
      freeShipping: true,
      estimatedDays: 9,
      cost: 0
    },
    category: 'electronics',
    subcategory: 'accessories',
    tags: ['מטען', 'אלחוטי', 'מהיר', 'qi'],
    images: [
      {
        url: 'https://m.media-amazon.com/images/I/61J3L4MZHSL._AC_SL1500_.jpg',
        alt: 'מטען אלחוטי',
        isPrimary: true
      }
    ],
    specifications: {
      brand: 'ChargePro',
      color: 'שחור',
      weight: '0.1 ק״ג',
      material: 'פלסטיק ABS'
    },
    features: [
      'טעינה מהירה 15W',
      'תואם iPhone ו-Android',
      'הגנת יתר מובנית',
      'עיצוב מינימליסטי',
      'LED indicator',
      'כבל USB-C מצורף'
    ],
    rating: {
      average: 4.4,
      count: 567,
      amazonRating: 4.4,
      amazonReviewsCount: 567
    },
    links: {
      amazon: 'https://www.amazon.com/dp/B08XY9JKLM',
      affiliateUrl: 'https://www.amazon.com/dp/B08XY9JKLM?tag=yourstore-20'
    },
    status: 'active',
    featured: false
  },
  {
    asin: 'B09HJKLNOP',
    name_he: 'שטיח יוגה אנטי-סליפ',
    name_en: 'Premium Non-Slip Yoga Mat',
    description_he: 'שטיח יוגה איכותי בעובי 6 מ״מ, עם משטח אנטי-סליפ משני הצדדים. עשוי מחומרים ידידותיים לסביבה, קל לניקוי. מגיע עם רצועת נשיאה.',
    description_en: 'Premium 6mm yoga mat with non-slip surface.',
    price: {
      usd: 34.99,
      ils: 128
    },
    stock: {
      available: true,
      quantity: 45
    },
    shipping: {
      freeShipping: true,
      estimatedDays: 11,
      cost: 0
    },
    category: 'sports',
    subcategory: 'fitness',
    tags: ['יוגה', 'שטיח', 'פיטנס', 'ספורט'],
    images: [
      {
        url: 'https://m.media-amazon.com/images/I/81Q9g7NXUPL._AC_SL1500_.jpg',
        alt: 'שטיח יוגה',
        isPrimary: true
      }
    ],
    specifications: {
      brand: 'YogaPro',
      color: 'סגול',
      size: '183 x 61 ס״מ',
      weight: '1 ק״ג',
      material: 'TPE ידידותי לסביבה'
    },
    features: [
      'עובי 6 מ״מ',
      'אנטי-סליפ משני הצדדים',
      'ידידותי לסביבה',
      'קל לניקוי',
      'רצועת נשיאה מצורפת',
      'עמיד ואיכותי'
    ],
    rating: {
      average: 4.6,
      count: 1120,
      amazonRating: 4.6,
      amazonReviewsCount: 1120
    },
    links: {
      amazon: 'https://www.amazon.com/dp/B09HJKLNOP',
      affiliateUrl: 'https://www.amazon.com/dp/B09HJKLNOP?tag=yourstore-20'
    },
    status: 'active',
    featured: true
  },
  {
    asin: 'B0CDEF1234',
    name_he: 'מנורת LED חכמה WiFi',
    name_en: 'Smart WiFi LED Bulb',
    description_he: 'נורת LED חכמה עם שליטה מרחוק דרך אפליקציה. 16 מיליון צבעים, בהירות מתכווננת, תואם Alexa ו-Google Home. צריכת חשמל נמוכה.',
    description_en: 'Smart LED bulb with app control and 16M colors.',
    price: {
      usd: 12.99,
      ils: 47
    },
    stock: {
      available: true,
      quantity: 150
    },
    shipping: {
      freeShipping: false,
      estimatedDays: 13,
      cost: 12
    },
    category: 'home',
    subcategory: 'lighting',
    tags: ['מנורה', 'חכמה', 'led', 'wifi'],
    images: [
      {
        url: 'https://m.media-amazon.com/images/I/51vNdQGbMqL._AC_SL1500_.jpg',
        alt: 'מנורת LED חכמה',
        isPrimary: true
      }
    ],
    specifications: {
      brand: 'SmartLight',
      color: 'לבן (16M צבעים)',
      weight: '0.08 ק״ג',
      material: 'פלסטיק + LED'
    },
    features: [
      '16 מיליון צבעים',
      'שליטה באפליקציה',
      'תואם Alexa ו-Google',
      'בהירות מתכווננת',
      'צריכה נמוכה 9W',
      'חיי מנורה ארוכים'
    ],
    rating: {
      average: 4.2,
      count: 430,
      amazonRating: 4.2,
      amazonReviewsCount: 430
    },
    links: {
      amazon: 'https://www.amazon.com/dp/B0CDEF1234',
      affiliateUrl: 'https://www.amazon.com/dp/B0CDEF1234?tag=yourstore-20'
    },
    status: 'active',
    featured: false
  },
  {
    asin: 'B0A1B2C3D4',
    name_he: 'מקלדת מכנית RGB למשחקים',
    name_en: 'RGB Mechanical Gaming Keyboard',
    description_he: 'מקלדת מכנית איכותית למשחקים עם תאורת RGB מתכווננת. מקשים מכניים Blue Switch, Anti-ghosting, עיצוב ארגונומי עם משענת יד.',
    description_en: 'Premium mechanical gaming keyboard with RGB lighting.',
    price: {
      usd: 59.99,
      ils: 219
    },
    originalPrice: {
      usd: 89.99,
      ils: 328
    },
    discount: 33,
    stock: {
      available: true,
      quantity: 25
    },
    shipping: {
      freeShipping: true,
      estimatedDays: 10,
      cost: 0
    },
    category: 'electronics',
    subcategory: 'gaming',
    tags: ['מקלדת', 'משחקים', 'rgb', 'מכנית'],
    images: [
      {
        url: 'https://m.media-amazon.com/images/I/81kWP5jvRPL._AC_SL1500_.jpg',
        alt: 'מקלדת מכנית',
        isPrimary: true
      }
    ],
    specifications: {
      brand: 'GameTech',
      color: 'שחור + RGB',
      weight: '1.2 ק״ג',
      material: 'מתכת ופלסטיק ABS'
    },
    features: [
      'מקשים מכניים Blue',
      'תאורת RGB מותאמת',
      'Anti-ghosting',
      'משענת יד נשלפת',
      'כבל USB מקולע',
      'עיצוב למשחקים'
    ],
    rating: {
      average: 4.5,
      count: 780,
      amazonRating: 4.5,
      amazonReviewsCount: 780
    },
    links: {
      amazon: 'https://www.amazon.com/dp/B0A1B2C3D4',
      affiliateUrl: 'https://www.amazon.com/dp/B0A1B2C3D4?tag=yourstore-20'
    },
    status: 'active',
    featured: true
  },
  {
    asin: 'B0E5F6G7H8',
    name_he: 'מסך מחשב 24 אינץ׳ Full HD',
    name_en: '24" Full HD Monitor',
    description_he: 'מסך מחשב 24 אינץ׳ ברזולוציית Full HD 1920x1080. זמן תגובה 5ms, זווית צפייה רחבה, חיבורי HDMI ו-VGA. מושלם לעבודה ומשחקים.',
    description_en: '24" Full HD monitor with wide viewing angle.',
    price: {
      usd: 119.99,
      ils: 438
    },
    stock: {
      available: true,
      quantity: 15
    },
    shipping: {
      freeShipping: true,
      estimatedDays: 15,
      cost: 0
    },
    category: 'electronics',
    subcategory: 'monitors',
    tags: ['מסך', 'מחשב', 'full hd', 'monitor'],
    images: [
      {
        url: 'https://m.media-amazon.com/images/I/71vY7BTZKSL._AC_SL1500_.jpg',
        alt: 'מסך מחשב 24 אינץ׳',
        isPrimary: true
      }
    ],
    specifications: {
      brand: 'ViewPro',
      color: 'שחור',
      size: '24 אינץ׳',
      weight: '3.5 ק״ג',
      dimensions: '54 x 32 x 18 ס״מ'
    },
    features: [
      'רזולוציה Full HD',
      'זמן תגובה 5ms',
      'זווית צפייה 178°',
      'חיבורי HDMI + VGA',
      'עיצוב דק',
      'מעמד מתכוונן'
    ],
    rating: {
      average: 4.4,
      count: 920,
      amazonRating: 4.4,
      amazonReviewsCount: 920
    },
    links: {
      amazon: 'https://www.amazon.com/dp/B0E5F6G7H8',
      affiliateUrl: 'https://www.amazon.com/dp/B0E5F6G7H8?tag=yourstore-20'
    },
    status: 'active',
    featured: false
  },
  {
    asin: 'B0I9J0K1L2',
    name_he: 'ערכת כלי עבודה 100 חלקים',
    name_en: '100-Piece Tool Set',
    description_he: 'ערכת כלי עבודה מקצועית הכוללת 100 חלקים. מברגים, מפתחות, פטיש, מד מתח ועוד. ארגונית מסודרת עם תא לכל כלי. מושלמת לבית ולרכב.',
    description_en: 'Professional 100-piece tool set in organized case.',
    price: {
      usd: 44.99,
      ils: 164
    },
    stock: {
      available: true,
      quantity: 35
    },
    shipping: {
      freeShipping: true,
      estimatedDays: 13,
      cost: 0
    },
    category: 'automotive',
    subcategory: 'tools',
    tags: ['כלי עבודה', 'ערכה', 'מברגים', 'תיקונים'],
    images: [
      {
        url: 'https://m.media-amazon.com/images/I/81LKJHGFDS._AC_SL1500_.jpg',
        alt: 'ערכת כלי עבודה',
        isPrimary: true
      }
    ],
    specifications: {
      brand: 'ToolMaster',
      color: 'אדום-שחור',
      weight: '2.5 ק״ג',
      material: 'פלדה מחוסמת'
    },
    features: [
      '100 חלקים מקצועיים',
      'ארגונית מסודרת',
      'כלים איכותיים',
      'מושלם לבית ורכב',
      'תיק נשיאה חזק',
      'אחריות יצרן'
    ],
    rating: {
      average: 4.6,
      count: 1450,
      amazonRating: 4.6,
      amazonReviewsCount: 1450
    },
    links: {
      amazon: 'https://www.amazon.com/dp/B0I9J0K1L2',
      affiliateUrl: 'https://www.amazon.com/dp/B0I9J0K1L2?tag=yourstore-20'
    },
    status: 'active',
    featured: false
  },
  {
    asin: 'B0M3N4O5P6',
    name_he: 'מצלמת אבטחה חכמה WiFi',
    name_en: 'Smart WiFi Security Camera',
    description_he: 'מצלמת אבטחה חכמה עם רזולוציה 1080p, ראיית לילה, זיהוי תנועה והתרעות בזמן אמת. שליטה מרחוק דרך אפליקציה, אחסון ענן זמין.',
    description_en: 'Smart 1080p WiFi camera with night vision and motion detection.',
    price: {
      usd: 49.99,
      ils: 182
    },
    originalPrice: {
      usd: 79.99,
      ils: 292
    },
    discount: 37,
    stock: {
      available: true,
      quantity: 40
    },
    shipping: {
      freeShipping: true,
      estimatedDays: 11,
      cost: 0
    },
    category: 'home',
    subcategory: 'security',
    tags: ['מצלמה', 'אבטחה', 'חכמה', 'wifi'],
    images: [
      {
        url: 'https://m.media-amazon.com/images/I/61QWERTY12L._AC_SL1500_.jpg',
        alt: 'מצלמת אבטחה חכמה',
        isPrimary: true
      }
    ],
    specifications: {
      brand: 'SecureCam',
      color: 'לבן',
      weight: '0.3 ק״ג',
      material: 'פלסטיק עמיד'
    },
    features: [
      'רזולוציה 1080p',
      'ראיית לילה',
      'זיהוי תנועה',
      'התרעות בזמן אמת',
      'שליטה באפליקציה',
      'אחסון ענן זמין'
    ],
    rating: {
      average: 4.3,
      count: 670,
      amazonRating: 4.3,
      amazonReviewsCount: 670
    },
    links: {
      amazon: 'https://www.amazon.com/dp/B0M3N4O5P6',
      affiliateUrl: 'https://www.amazon.com/dp/B0M3N4O5P6?tag=yourstore-20'
    },
    status: 'active',
    featured: true
  }
];

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // מחיקת מוצרים קיימים
    await Product.deleteMany({});
    console.log('🗑️  Cleared existing products');

    // ⭐ השינוי החשוב: שימוש ב-create במקום insertMany
    // create מפעיל את ה-middleware ויוצר slug אוטומטית
    const createdProducts = [];
    
    for (const productData of products) {
      const product = await Product.create(productData);
      createdProducts.push(product);
      console.log(`✅ Added: ${product.name_he}`);
    }

    console.log(`\n🎉 Successfully added ${createdProducts.length} products!`);
    
    console.log('\n📦 Products summary:');
    console.log('━'.repeat(60));
    createdProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name_he}`);
      console.log(`   ASIN: ${product.asin} | Slug: ${product.slug}`);
      console.log(`   Price: ₪${product.price.ils} | Category: ${product.category}`);
      console.log(`   Featured: ${product.featured ? '⭐ Yes' : '❌ No'}`);
      console.log('━'.repeat(60));
    });

    console.log('\n✨ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

seedDatabase();