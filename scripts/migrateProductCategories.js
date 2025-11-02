// scripts/migrateProductCategories.js - Migrate products from legacy categories to new Category system

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';

// Load environment variables
dotenv.config();

// Category mapping from legacy string to new category slug
const CATEGORY_MAPPING = {
  'electronics': 'electronics',
  'fashion': 'fashion',
  'fashion-clothing': 'fashion',
  'home': 'home-garden',
  'sports': 'sports-outdoors',
  'toys': 'toys-baby',
  'books': 'electronics', // Map to electronics since we don't have books
  'beauty': 'beauty-health',
  'automotive': 'electronics', // Map to electronics
  'grocery': 'home-garden', // Map to home-garden
  'other': null // Will need manual assignment
};

async function migrateProductCategories() {
  try {
    console.log('🔄 Starting product category migration...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all products
    const products = await Product.find().select('_id name_he category categoryLegacy').lean();
    console.log(`📦 Found ${products.length} products\n`);

    // Get all categories from new system
    const categories = await Category.find().select('_id name slug').lean();
    console.log(`📁 Found ${categories.length} categories in new system:`);
    categories.forEach(cat => {
      console.log(`   - ${cat.name.he} (${cat.slug})`);
    });
    console.log('');

    // Create a map of slug -> category ID
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.slug] = cat._id;
    });

    // Statistics
    let updated = 0;
    let alreadyMigrated = 0;
    let needsManualReview = 0;
    const updateLog = [];

    // Process each product
    for (const product of products) {
      const legacyCategory = product.categoryLegacy || product.category;

      // Check if already migrated (category is ObjectId)
      if (product.category && mongoose.Types.ObjectId.isValid(product.category) && product.category.toString().length === 24) {
        alreadyMigrated++;
        console.log(`⏭️  Skip: "${product.name_he}" - already migrated`);
        continue;
      }

      // If no legacy category, skip
      if (!legacyCategory || typeof legacyCategory !== 'string') {
        needsManualReview++;
        console.log(`⚠️  Manual: "${product.name_he}" - no category set`);
        updateLog.push({
          product: product.name_he,
          id: product._id,
          issue: 'No category',
          action: 'Needs manual assignment'
        });
        continue;
      }

      // Get the mapped slug
      const mappedSlug = CATEGORY_MAPPING[legacyCategory.toLowerCase()];

      if (!mappedSlug) {
        needsManualReview++;
        console.log(`⚠️  Manual: "${product.name_he}" - unknown category "${legacyCategory}"`);
        updateLog.push({
          product: product.name_he,
          id: product._id,
          issue: `Unknown category: ${legacyCategory}`,
          action: 'Needs manual assignment'
        });
        continue;
      }

      // Get the new category ID
      const newCategoryId = categoryMap[mappedSlug];

      if (!newCategoryId) {
        needsManualReview++;
        console.log(`⚠️  Manual: "${product.name_he}" - category "${mappedSlug}" not found in system`);
        updateLog.push({
          product: product.name_he,
          id: product._id,
          issue: `Category ${mappedSlug} not found`,
          action: 'Needs manual assignment'
        });
        continue;
      }

      // Update the product
      await Product.findByIdAndUpdate(product._id, {
        category: newCategoryId,
        categoryLegacy: legacyCategory
      });

      updated++;
      const newCategoryName = categories.find(c => c._id.equals(newCategoryId))?.name.he;
      console.log(`✅ Updated: "${product.name_he}" - ${legacyCategory} → ${newCategoryName}`);
      updateLog.push({
        product: product.name_he,
        id: product._id,
        from: legacyCategory,
        to: newCategoryName,
        action: 'Migrated'
      });
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`Total products:          ${products.length}`);
    console.log(`✅ Successfully migrated: ${updated}`);
    console.log(`⏭️  Already migrated:     ${alreadyMigrated}`);
    console.log(`⚠️  Needs manual review:  ${needsManualReview}`);
    console.log('='.repeat(60));

    if (needsManualReview > 0) {
      console.log('\n⚠️  Products needing manual review:');
      const manualProducts = updateLog.filter(log => log.action === 'Needs manual assignment');
      manualProducts.forEach(log => {
        console.log(`   - ${log.product} (${log.id}): ${log.issue}`);
      });
    }

    console.log('\n✨ Migration completed!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the migration
migrateProductCategories();
