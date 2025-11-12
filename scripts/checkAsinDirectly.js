// scripts/checkAsinDirectly.js - בדיקה ישירה של ASIN

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const checkAsin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ מחובר למסד נתונים');

    const db = mongoose.connection.db;
    const products = await db.collection('products').find({}).project({ _id: 1, name_he: 1, asin: 1 }).limit(10).toArray();

    console.log('\n📋 כל המוצרים (10 ראשונים):');
    products.forEach(p => {
      console.log(`  - ${p.name_he}`);
      console.log(`    ID: ${p._id}`);
      console.log(`    ASIN: ${JSON.stringify(p.asin)} (type: ${typeof p.asin})`);
      console.log(`    Has ASIN field: ${p.hasOwnProperty('asin')}`);
    });

    // בדיקה מדויקת
    const withUndefinedString = await db.collection('products').countDocuments({ asin: 'undefined' });
    const withEmptyString = await db.collection('products').countDocuments({ asin: '' });
    const withNull = await db.collection('products').countDocuments({ asin: null });
    const withoutField = await db.collection('products').countDocuments({ asin: { $exists: false } });
    const withRealValue = await db.collection('products').countDocuments({ asin: { $type: 'string', $gt: '', $nin: ['undefined', 'null'] } });

    console.log('\n📊 סטטיסטיקות ASIN:');
    console.log(`  - עם מחרוזת "undefined": ${withUndefinedString}`);
    console.log(`  - עם מחרוזת ריקה "": ${withEmptyString}`);
    console.log(`  - עם null: ${withNull}`);
    console.log(`  - בלי שדה בכלל: ${withoutField}`);
    console.log(`  - עם ערך תקין: ${withRealValue}`);

  } catch (error) {
    console.error('❌ שגיאה:', error);
  } finally {
    await mongoose.connection.close();
  }
};

checkAsin();
