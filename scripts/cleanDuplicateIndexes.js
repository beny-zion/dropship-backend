// scripts/cleanDuplicateIndexes.js
// Script to clean duplicate and conflicting indexes from MongoDB

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/amazon-dropship';

async function cleanIndexes() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // 1. Clean Product indexes
    console.log('🧹 Cleaning Product indexes...');
    const productCollection = db.collection('products');
    const productIndexes = await productCollection.indexes();

    console.log('Current Product indexes:');
    productIndexes.forEach(idx => console.log(`  - ${idx.name}`));

    // Drop duplicate slug index (keeping only the one from unique: true)
    try {
      const slugIndexExists = productIndexes.some(idx =>
        idx.name === 'slug_1' && !idx.unique
      );
      if (slugIndexExists) {
        await productCollection.dropIndex('slug_1');
        console.log('  ✅ Dropped duplicate slug_1 index');
      }
    } catch (err) {
      console.log(`  ℹ️  slug_1 index: ${err.message}`);
    }

    // Drop old asin index if it exists with wrong name
    try {
      const asinIndexExists = productIndexes.some(idx =>
        idx.name === 'asin_1_partial' || idx.name === 'asin_1'
      );
      if (asinIndexExists) {
        // Try both possible names
        try {
          await productCollection.dropIndex('asin_1_partial');
          console.log('  ✅ Dropped old asin_1_partial index');
        } catch (e) {
          // Ignore if doesn't exist
        }
        try {
          await productCollection.dropIndex('asin_1');
          console.log('  ✅ Dropped old asin_1 index');
        } catch (e) {
          // Ignore if doesn't exist
        }
      }
    } catch (err) {
      console.log(`  ℹ️  asin index: ${err.message}`);
    }

    // 2. Clean Cart indexes
    console.log('\n🧹 Cleaning Cart indexes...');
    const cartCollection = db.collection('carts');
    const cartIndexes = await cartCollection.indexes();

    console.log('Current Cart indexes:');
    cartIndexes.forEach(idx => console.log(`  - ${idx.name}`, idx.unique ? '(unique)' : ''));

    // Drop non-unique user_1 index (keeping only the unique one)
    try {
      const userIndexes = cartIndexes.filter(idx => idx.name === 'user_1');
      if (userIndexes.length > 1) {
        // Drop all user_1 indexes
        await cartCollection.dropIndex('user_1');
        console.log('  ✅ Dropped duplicate user_1 index');
      } else if (userIndexes.length === 1 && !userIndexes[0].unique) {
        // Drop if it exists but is not unique
        await cartCollection.dropIndex('user_1');
        console.log('  ✅ Dropped non-unique user_1 index');
      }
    } catch (err) {
      console.log(`  ℹ️  user_1 index: ${err.message}`);
    }

    // 3. Clean OrderStatus indexes
    console.log('\n🧹 Cleaning OrderStatus indexes...');
    const orderStatusCollection = db.collection('orderstatuses');
    const orderStatusIndexes = await orderStatusCollection.indexes();

    console.log('Current OrderStatus indexes:');
    orderStatusIndexes.forEach(idx => console.log(`  - ${idx.name}`, idx.unique ? '(unique)' : ''));

    // Drop non-unique key_1 index (keeping only the unique one)
    try {
      const keyIndexes = orderStatusIndexes.filter(idx => idx.name === 'key_1');
      if (keyIndexes.length > 1) {
        // Drop all key_1 indexes
        await orderStatusCollection.dropIndex('key_1');
        console.log('  ✅ Dropped duplicate key_1 index');
      } else if (keyIndexes.length === 1 && !keyIndexes[0].unique) {
        // Drop if it exists but is not unique
        await orderStatusCollection.dropIndex('key_1');
        console.log('  ✅ Dropped non-unique key_1 index');
      }
    } catch (err) {
      console.log(`  ℹ️  key_1 index: ${err.message}`);
    }

    console.log('\n✅ Index cleanup completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Restart your server to rebuild indexes correctly');
    console.log('2. Check server logs for any remaining warnings');

  } catch (error) {
    console.error('❌ Error cleaning indexes:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

cleanIndexes();
