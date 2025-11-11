import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import HomePage model
import HomePage from '../src/models/HomePage.js';

const initHomePage = async () => {
  try {
    console.log('🔄 מתחבר ל-MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ התחברות ל-MongoDB הצליחה\n');

    // בדוק אם כבר קיים דף בית פעיל
    const existingHomePage = await HomePage.findOne({ isActive: true });

    if (existingHomePage) {
      console.log('⚠️  כבר קיים דף בית פעיל:');
      console.log(`   📄 שם: ${existingHomePage.name}`);
      console.log(`   🆔 ID: ${existingHomePage._id}`);
      console.log(`   📊 מספר sections: ${existingHomePage.sections.length}\n`);

      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('האם תרצה למחוק אותו וליצור חדש? (y/N): ', async (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          await HomePage.deleteMany({});
          console.log('🗑️  דפי בית קיימים נמחקו\n');
          await createHomePage();
        } else {
          console.log('❌ ביטול. דף הבית הקיים לא נמחק.');
          process.exit(0);
        }
        rl.close();
      });
    } else {
      await createHomePage();
    }

  } catch (error) {
    console.error('❌ שגיאה:', error.message);
    process.exit(1);
  }
};

const createHomePage = async () => {
  console.log('🚀 יוצר דף בית ראשוני...\n');

  // צור דף בית עם 3 sections בסיסיים
  const homepage = await HomePage.create({
    name: 'דף בית ראשי',
    isActive: true,
    language: 'both',
    sections: [
      {
        type: 'hero_banner',
        displayOrder: 0,
        isActive: true,
        visibility: {
          desktop: true,
          tablet: true,
          mobile: true
        },
        content: {
          heroBanner: {
            images: [{
              desktop: {
                url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1920&h=600&fit=crop',
                alt: 'Welcome to our store'
              },
              mobile: {
                url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&h=400&fit=crop',
                alt: 'Welcome to our store'
              },
              link: '/products',
              displayOrder: 0
            }],
            autoplay: {
              enabled: true,
              interval: 5000
            },
            overlay: {
              enabled: true,
              color: 'rgba(0,0,0,0.3)',
              opacity: 0.3
            },
            text: {
              he: {
                title: 'ברוכים הבאים לחנות שלנו',
                subtitle: 'מוצרים איכותיים במחירים הטובים ביותר',
                ctaText: 'קנה עכשיו'
              },
              en: {
                title: 'Welcome to Our Store',
                subtitle: 'Quality products at the best prices',
                ctaText: 'Shop Now'
              }
            },
            styling: {
              height: '600px',
              textPosition: 'center',
              textColor: '#ffffff',
              animation: 'fade'
            }
          }
        },
        containerStyling: {
          backgroundColor: '#000000',
          padding: '0',
          margin: '0',
          maxWidth: '100%'
        }
      },
      {
        type: 'category_grid',
        displayOrder: 1,
        isActive: true,
        visibility: {
          desktop: true,
          tablet: true,
          mobile: true
        },
        content: {
          categoryGrid: {
            title: {
              he: 'קטגוריות מובילות',
              en: 'Top Categories'
            },
            categories: [], // יתמלא אוטומטית אם displayMode הוא 'all'
            displayMode: 'all',
            layout: {
              columns: {
                desktop: 4,
                tablet: 2,
                mobile: 1
              },
              gap: '24px',
              cardStyle: 'modern'
            }
          }
        },
        containerStyling: {
          backgroundColor: '#ffffff',
          padding: '60px 20px',
          margin: '0',
          maxWidth: '1200px'
        }
      },
      {
        type: 'product_carousel',
        displayOrder: 2,
        isActive: true,
        visibility: {
          desktop: true,
          tablet: true,
          mobile: true
        },
        content: {
          productCarousel: {
            title: {
              he: 'מוצרים מומלצים',
              en: 'Featured Products'
            },
            products: [],
            productSource: 'featured', // יביא מוצרים עם isFeatured: true
            limit: 12,
            layout: {
              itemsPerView: {
                desktop: 4,
                tablet: 2,
                mobile: 1
              },
              spaceBetween: 20,
              navigation: true,
              pagination: true,
              autoplay: true
            }
          }
        },
        containerStyling: {
          backgroundColor: '#f9f9f9',
          padding: '60px 20px',
          margin: '0',
          maxWidth: '1200px'
        }
      }
    ],
    seo: {
      title: {
        he: 'חנות אלקטרוניקה מספר 1 בישראל',
        en: 'Number 1 Electronics Store in Israel'
      },
      description: {
        he: 'המגוון הגדול ביותר של מוצרי אלקטרוניקה במחירים הכי זולים',
        en: 'Largest selection of electronics at the lowest prices'
      },
      keywords: ['אלקטרוניקה', 'טכנולוגיה', 'מחשבים', 'טלפונים', 'electronics', 'technology'],
      ogImage: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200&h=630&fit=crop'
    },
    globalStyling: {
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      fontFamily: 'Assistant, sans-serif'
    },
    analytics: {
      views: 0,
      totalClicks: 0
    },
    publishedAt: new Date()
  });

  console.log('✅ דף בית נוצר בהצלחה!\n');
  console.log('📄 פרטי דף הבית:');
  console.log(`   🆔 ID: ${homepage._id}`);
  console.log(`   📝 שם: ${homepage.name}`);
  console.log(`   🌍 שפה: ${homepage.language}`);
  console.log(`   ✅ סטטוס: ${homepage.isActive ? 'פעיל' : 'לא פעיל'}`);
  console.log(`   📊 מספר sections: ${homepage.sections.length}\n`);

  console.log('📦 Sections שנוצרו:');
  homepage.sections.forEach((section, index) => {
    console.log(`   ${index + 1}. ${section.type} (${section.isActive ? 'פעיל' : 'לא פעיל'})`);
  });

  console.log('\n🎉 הכל מוכן! עכשיו אפשר:');
  console.log('   1. להריץ את השרת: npm run dev');
  console.log('   2. לבדוק את ה-API: GET http://localhost:5000/api/homepage');
  console.log('   3. לגשת לאדמין: GET http://localhost:5000/api/homepage/admin\n');

  process.exit(0);
};

initHomePage();
