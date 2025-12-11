/**
 * Migration Script: Add Item-Level Tracking to Orders
 *
 * This script adds the new item-level tracking fields to existing orders
 * without losing any data.
 *
 * Run with: node backend/scripts/migrate-order-items.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../src/models/Order.js';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI not found in .env file');
  process.exit(1);
}

console.log('📝 Using MongoDB URI:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));

async function migrateOrders() {
  try {
    console.log('🔄 Starting order items migration...\n');

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all orders
    const orders = await Order.find({});
    console.log(`📦 Found ${orders.length} orders to migrate\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      try {
        let needsUpdate = false;

        // Check if order needs migration
        if (!order.items || order.items.length === 0) {
          console.log(`⏭️  Skipping order ${order.orderNumber} - no items`);
          skippedCount++;
          continue;
        }

        // Update each item with new fields
        order.items = order.items.map(item => {
          const updatedItem = { ...item.toObject() };

          // Add itemStatus if not exists
          if (!updatedItem.itemStatus) {
            updatedItem.itemStatus = 'pending';
            needsUpdate = true;
          }

          // Add supplierOrder if not exists
          if (!updatedItem.supplierOrder) {
            updatedItem.supplierOrder = {
              orderedAt: null,
              orderedBy: null,
              supplierOrderNumber: null,
              supplierTrackingNumber: null,
              actualCost: null,
              notes: null
            };
            needsUpdate = true;
          }

          // Add cancellation if not exists
          if (!updatedItem.cancellation) {
            updatedItem.cancellation = {
              cancelled: false,
              reason: null,
              cancelledAt: null,
              cancelledBy: null,
              refundAmount: null,
              refundProcessed: false
            };
            needsUpdate = true;
          }

          // Add statusHistory if not exists
          if (!updatedItem.statusHistory || updatedItem.statusHistory.length === 0) {
            updatedItem.statusHistory = [{
              status: 'pending',
              changedAt: order.createdAt || new Date(),
              changedBy: null,
              notes: 'Initial status (added by migration)'
            }];
            needsUpdate = true;
          }

          return updatedItem;
        });

        // Add refunds array if not exists
        if (!order.refunds) {
          order.refunds = [];
          needsUpdate = true;
        }

        // Add pricing fields if not exists
        if (!order.pricing.adjustedTotal) {
          order.pricing.adjustedTotal = order.pricing.total;
          needsUpdate = true;
        }

        if (order.pricing.totalRefunds === undefined) {
          order.pricing.totalRefunds = 0;
          needsUpdate = true;
        }

        // Save if changes were made
        if (needsUpdate) {
          await order.save();
          console.log(`✅ Migrated order ${order.orderNumber} (${order.items.length} items)`);
          migratedCount++;
        } else {
          console.log(`⏭️  Order ${order.orderNumber} already up to date`);
          skippedCount++;
        }

      } catch (err) {
        console.error(`❌ Error migrating order ${order.orderNumber}:`, err.message);
        errorCount++;
      }
    }

    // Summary
    console.log('\n📊 Migration Summary:');
    console.log('─────────────────────────────');
    console.log(`Total orders: ${orders.length}`);
    console.log(`✅ Migrated: ${migratedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('─────────────────────────────\n');

    if (errorCount === 0) {
      console.log('🎉 Migration completed successfully!\n');
    } else {
      console.log('⚠️  Migration completed with errors. Please review the logs.\n');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run migration
migrateOrders();
