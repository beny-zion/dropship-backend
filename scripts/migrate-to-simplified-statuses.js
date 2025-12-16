/**
 * Migration Script: Simplified Statuses
 *
 * ✨ מיגרציה מהסטטוסים הישנים (9+10) לסטטוסים החדשים (7+6)
 *
 * Usage:
 *   node scripts/migrate-to-simplified-statuses.js
 *   node scripts/migrate-to-simplified-statuses.js --dry-run  (לבדיקה בלבד)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../src/models/Order.js';

dotenv.config();

// ✅ מיפוי סטטוסי Item מישן לחדש
const ITEM_STATUS_MIGRATION_MAP = {
  'pending': 'pending',                          // ללא שינוי
  'ordered_from_supplier': 'ordered',            // פשוט ל-ordered
  'arrived_us_warehouse': 'in_transit',          // מוזג ל-in_transit
  'shipped_to_israel': 'in_transit',             // מוזג ל-in_transit
  'customs_israel': 'in_transit',                // מוזג ל-in_transit
  'arrived_israel': 'arrived_israel',            // ללא שינוי
  'ready_for_delivery': 'arrived_israel',        // מוזג ל-arrived_israel
  'delivered': 'delivered',                      // ללא שינוי
  'cancelled': 'cancelled'                       // ללא שינוי
};

// ✅ מיפוי סטטוסי Order מישן לחדש
const ORDER_STATUS_MIGRATION_MAP = {
  'pending': 'pending',                          // ללא שינוי
  'payment_hold': 'pending',                     // מוזג ל-pending (יטופל ידנית)
  'ordered': 'in_progress',                      // מוזג ל-in_progress
  'arrived_us_warehouse': 'in_progress',         // מוזג ל-in_progress
  'shipped_to_israel': 'in_progress',            // מוזג ל-in_progress
  'customs_israel': 'in_progress',               // מוזג ל-in_progress
  'arrived_israel_warehouse': 'ready_to_ship',   // מוזג ל-ready_to_ship
  'shipped_to_customer': 'shipped',              // מוזג ל-shipped
  'delivered': 'delivered',                      // ללא שינוי
  'cancelled': 'cancelled'                       // ללא שינוי
};

/**
 * מיגרציה של פריט בודד
 */
function migrateItemStatus(item) {
  const oldStatus = item.itemStatus;
  const newStatus = ITEM_STATUS_MIGRATION_MAP[oldStatus] || oldStatus;

  if (oldStatus !== newStatus) {
    return {
      changed: true,
      oldStatus,
      newStatus,
      itemName: item.name
    };
  }

  return { changed: false };
}

/**
 * מיגרציה של הזמנה
 */
function migrateOrder(order, dryRun = false) {
  const changes = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    itemsChanged: [],
    orderStatusChanged: false,
    oldOrderStatus: order.status,
    newOrderStatus: null
  };

  // 1. Migrate item statuses
  order.items.forEach(item => {
    const itemChange = migrateItemStatus(item);
    if (itemChange.changed) {
      changes.itemsChanged.push(itemChange);

      if (!dryRun) {
        item.itemStatus = itemChange.newStatus;

        // הוסף להיסטוריה
        item.statusHistory.push({
          status: itemChange.newStatus,
          changedAt: new Date(),
          notes: `🔄 מיגרציה אוטומטית: ${itemChange.oldStatus} → ${itemChange.newStatus}`,
          automated: true
        });
      }
    }
  });

  // 2. Migrate order status
  const oldOrderStatus = order.status;
  const newOrderStatus = ORDER_STATUS_MIGRATION_MAP[oldOrderStatus] || oldOrderStatus;

  if (oldOrderStatus !== newOrderStatus) {
    changes.orderStatusChanged = true;
    changes.newOrderStatus = newOrderStatus;

    if (!dryRun) {
      order.status = newOrderStatus;

      // הוסף ל-timeline
      order.timeline.push({
        status: newOrderStatus,
        message: `🔄 מיגרציה אוטומטית: ${oldOrderStatus} → ${newOrderStatus}`,
        timestamp: new Date(),
        automated: true
      });
    }
  }

  return changes;
}

/**
 * הפעלת המיגרציה
 */
async function runMigration(dryRun = false) {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 Migration: Simplified Statuses');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - לא יתבצעו שינויים במסד הנתונים');
  }

  try {
    // Connect to MongoDB
    console.log('\n📡 מתחבר ל-MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ חיבור הצליח');

    // Find all orders
    console.log('\n📊 טוען הזמנות...');
    const orders = await Order.find({});
    console.log(`✅ נמצאו ${orders.length} הזמנות`);

    // Statistics
    const stats = {
      totalOrders: orders.length,
      ordersWithChanges: 0,
      totalItemsChanged: 0,
      orderStatusChanges: 0,
      changesByItemStatus: {},
      changesByOrderStatus: {}
    };

    // Process each order
    console.log('\n🔄 מעבד הזמנות...\n');

    for (const order of orders) {
      const changes = migrateOrder(order, dryRun);

      // Track statistics
      if (changes.itemsChanged.length > 0 || changes.orderStatusChanged) {
        stats.ordersWithChanges++;

        // Item changes
        changes.itemsChanged.forEach(change => {
          stats.totalItemsChanged++;
          const key = `${change.oldStatus} → ${change.newStatus}`;
          stats.changesByItemStatus[key] = (stats.changesByItemStatus[key] || 0) + 1;
        });

        // Order status changes
        if (changes.orderStatusChanged) {
          stats.orderStatusChanges++;
          const key = `${changes.oldOrderStatus} → ${changes.newOrderStatus}`;
          stats.changesByOrderStatus[key] = (stats.changesByOrderStatus[key] || 0) + 1;
        }

        // Print changes
        console.log(`📦 הזמנה #${changes.orderNumber}:`);
        if (changes.orderStatusChanged) {
          console.log(`   └─ סטטוס הזמנה: ${changes.oldOrderStatus} → ${changes.newOrderStatus}`);
        }
        if (changes.itemsChanged.length > 0) {
          console.log(`   └─ ${changes.itemsChanged.length} פריטים עודכנו`);
          changes.itemsChanged.forEach(item => {
            console.log(`      └─ ${item.itemName}: ${item.oldStatus} → ${item.newStatus}`);
          });
        }
        console.log('');

        // Save if not dry run
        if (!dryRun) {
          await order.save();
        }
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 סיכום מיגרציה');
    console.log('='.repeat(60));
    console.log(`\n✅ סה"כ הזמנות: ${stats.totalOrders}`);
    console.log(`✅ הזמנות עם שינויים: ${stats.ordersWithChanges}`);
    console.log(`✅ פריטים שעודכנו: ${stats.totalItemsChanged}`);
    console.log(`✅ סטטוסי הזמנה שעודכנו: ${stats.orderStatusChanges}`);

    if (Object.keys(stats.changesByItemStatus).length > 0) {
      console.log('\n📦 שינויי סטטוס פריטים:');
      Object.entries(stats.changesByItemStatus).forEach(([change, count]) => {
        console.log(`   ${change}: ${count}`);
      });
    }

    if (Object.keys(stats.changesByOrderStatus).length > 0) {
      console.log('\n📋 שינויי סטטוס הזמנות:');
      Object.entries(stats.changesByOrderStatus).forEach(([change, count]) => {
        console.log(`   ${change}: ${count}`);
      });
    }

    if (dryRun) {
      console.log('\n⚠️  זהו dry run - לא נשמרו שינויים');
      console.log('💡 הרץ ללא --dry-run כדי לבצע את המיגרציה בפועל');
    } else {
      console.log('\n✅ המיגרציה הושלמה בהצלחה!');
    }

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('\n❌ שגיאה במיגרציה:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 התנתק מ-MongoDB');
  }
}

// Run migration
const isDryRun = process.argv.includes('--dry-run');

runMigration(isDryRun)
  .then(() => {
    console.log('\n✅ המיגרציה הסתיימה');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ המיגרציה נכשלה:', error);
    process.exit(1);
  });
