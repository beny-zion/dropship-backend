import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import Category from '../src/models/Category.js';

const checkSlugs = async () => {
  try {
    console.log('🔄 מתחבר ל-MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ התחברות ל-MongoDB הצליחה\n');

    const categories = await Category.find({});
    console.log(`📊 סך הכל קטגוריות: ${categories.length}\n`);

    const withoutSlug = categories.filter(c => !c.slug);

    if (withoutSlug.length === 0) {
      console.log('✅ לכל הקטגוריות יש slug!');
    } else {
      console.log(`⚠️  ${withoutSlug.length} קטגוריות ללא slug:\n`);
      withoutSlug.forEach(c => {
        const name = c.name?.he || c.name?.en || 'ללא שם';
        console.log(`   ❌ ${name} (ID: ${c._id})`);
      });
    }

    console.log('\n📋 רשימת כל הקטגוריות:');
    categories.forEach(c => {
      const name = c.name?.he || c.name?.en || 'ללא שם';
      const slug = c.slug || '❌ ללא slug';
      console.log(`   - ${name}: ${slug}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ שגיאה:', error.message);
    process.exit(1);
  }
};

checkSlugs();
