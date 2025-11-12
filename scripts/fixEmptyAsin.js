// scripts/fixEmptyAsin.js - תיקון ASIN ריק במסד הנתונים

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Product from '../src/models/Product.js';

dotenv.config();

const fixEmptyAsin = async () => {
  try {
    console.log('🔄 מתחבר למסד נתונים...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ מחובר למסד נתונים');

    // שלב 1: מחיקת האינדקס הישן
    console.log('\n📊 בודק אינדקסים קיימים...');
    const indexes = await Product.collection.getIndexes();
    console.log('אינדקסים קיימים:', Object.keys(indexes));

    if (indexes.asin_1) {
      console.log('🗑️  מוחק אינדקס ישן של asin...');
      try {
        await Product.collection.dropIndex('asin_1');
        console.log('✅ אינדקס ישן נמחק');
      } catch (error) {
        console.log('⚠️  שגיאה במחיקת אינדקס (אולי כבר נמחק):', error.message);
      }
    }

    // שלב 2: מציאת מוצרים עם ASIN ריק או בעייתי
    console.log('\n🔍 מחפש מוצרים עם ASIN ריק או בעייתי...');
    const productsWithEmptyAsin = await Product.find({
      $or: [
        { asin: '' },
        { asin: null },
        { asin: 'undefined' },
        { asin: 'null' },
        { asin: { $exists: false } }
      ]
    }).select('_id name_he asin');

    console.log(`נמצאו ${productsWithEmptyAsin.length} מוצרים עם ASIN ריק/בעייתי`);

    if (productsWithEmptyAsin.length > 0) {
      console.log('\nדוגמאות:');
      productsWithEmptyAsin.slice(0, 5).forEach(p => {
        console.log(`  - ${p.name_he} (ID: ${p._id}, ASIN: "${p.asin}")`);
      });
    }

    // שלב 3: מחיקת השדה asin ממוצרים עם ערך ריק או בעייתי
    console.log('\n🧹 מנקה ASIN ריק/בעייתי מהמוצרים...');
    const result = await Product.updateMany(
      {
        $or: [
          { asin: '' },
          { asin: null },
          { asin: 'undefined' },
          { asin: 'null' }
        ]
      },
      {
        $unset: { asin: '' }
      }
    );

    console.log(`✅ ${result.modifiedCount} מוצרים עודכנו (השדה asin נמחק)`);

    // שלב 4: יצירת אינדקס חדש עם partial filter
    console.log('\n📊 יוצר אינדקס חדש עם partial filter...');
    try {
      await Product.collection.createIndex(
        { asin: 1 },
        {
          unique: true,
          partialFilterExpression: {
            asin: { $type: 'string', $gt: '' }
          },
          name: 'asin_1_partial'
        }
      );
      console.log('✅ אינדקס חדש נוצר בהצלחה!');
    } catch (error) {
      console.log('⚠️  שגיאה ביצירת אינדקס:', error.message);
    }

    // שלב 5: וידוא - בדיקת אינדקסים חדשים
    console.log('\n📊 בדיקת אינדקסים סופית...');
    const newIndexes = await Product.collection.getIndexes();
    console.log('אינדקסים עדכניים:');
    Object.keys(newIndexes).forEach(indexName => {
      console.log(`  - ${indexName}`);
      if (indexName.includes('asin')) {
        console.log('    הגדרות:', JSON.stringify(newIndexes[indexName], null, 2));
      }
    });

    // שלב 6: בדיקה סופית
    console.log('\n✅ בדיקה סופית...');
    const remainingEmpty = await Product.countDocuments({
      $or: [
        { asin: '' },
        { asin: null }
      ]
    });

    if (remainingEmpty === 0) {
      console.log('✅ אין יותר מוצרים עם ASIN ריק!');
    } else {
      console.log(`⚠️  עדיין נותרו ${remainingEmpty} מוצרים עם ASIN ריק`);
    }

    console.log('\n✅ תיקון הושלם בהצלחה!');
    console.log('\n💡 עכשיו תוכל להוסיף מוצרים חדשים בלי ASIN ללא בעיה');

  } catch (error) {
    console.error('❌ שגיאה:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 ההתחברות למסד הנתונים נסגרה');
  }
};

fixEmptyAsin();
