/**
 * Migration Script: Add Computed Status Fields to Existing Orders
 *
 * This script updates all existing orders to include the new computed status fields.
 * Run with: node scripts/migrateToComputedStatus.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../src/models/Order.js';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/amazon-dropship';

async function migrateOrders() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all orders
    console.log('📦 Fetching all orders...');
    const orders = await Order.find({});
    console.log(`Found ${orders.length} orders\n`);

    if (orders.length === 0) {
      console.log('No orders to migrate.');
      await mongoose.connection.close();
      return;
    }

    // Statistics
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process each order
    console.log('🔄 Starting migration...\n');
    for (const order of orders) {
      try {
        // The pre-save middleware will automatically compute the fields
        // We just need to trigger a save
        await order.save();

        successCount++;

        // Show progress every 10 orders
        if (successCount % 10 === 0) {
          console.log(`✅ Processed ${successCount}/${orders.length} orders...`);
        }

      } catch (error) {
        errorCount++;
        errors.push({
          orderNumber: order.orderNumber,
          orderId: order._id,
          error: error.message
        });
        console.error(`❌ Error with order ${order.orderNumber}:`, error.message);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${successCount} orders`);
    console.log(`❌ Failed: ${errorCount} orders`);
    console.log('='.repeat(60) + '\n');

    if (errors.length > 0) {
      console.log('❌ Errors:');
      errors.forEach(err => {
        console.log(`  - Order ${err.orderNumber} (${err.orderId}): ${err.error}`);
      });
      console.log('');
    }

    // Sample verification - show 3 random orders
    console.log('🔍 Sample Verification (3 random orders):\n');
    const sampleOrders = await Order.find({}).limit(3);

    for (const order of sampleOrders) {
      console.log(`Order #${order.orderNumber}:`);
      console.log(`  - Overall Progress: ${order.computed.overallProgress}`);
      console.log(`  - Completion: ${order.computed.completionPercentage}%`);
      console.log(`  - Has Active Items: ${order.computed.hasActiveItems}`);
      console.log(`  - All Items Delivered: ${order.computed.allItemsDelivered}`);
      console.log(`  - Needs Attention: ${order.computed.needsAttention}`);
      console.log(`  - Last Computed: ${order.computed.lastComputedAt}`);
      console.log('');
    }

    console.log('✨ Migration completed successfully!\n');

  } catch (error) {
    console.error('💥 Fatal error during migration:', error);
    process.exit(1);
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrateOrders()
  .then(() => {
    console.log('👋 Migration script finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });
