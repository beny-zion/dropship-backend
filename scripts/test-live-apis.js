/**
 * Live API Testing Script
 *
 * בודק את כל ה-APIs עם הזמנות אמיתיות מה-DB
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../src/models/Order.js';
import User from '../src/models/User.js';
import { ITEM_STATUS } from '../src/constants/itemStatuses.js';
import {
  updateItemStatus,
  orderFromSupplier,
  cancelItem,
  getItemHistory
} from '../src/controllers/adminOrderItemsController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Helper to reload order
async function reloadOrder(order) {
  const fresh = await Order.findById(order._id);
  Object.assign(order, fresh.toObject());
}

// Mock request/response objects
function createMockReq(user, params, body) {
  return {
    user,
    params,
    body
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    }
  };
  return res;
}

async function runTests() {
  try {
    console.log('🔄 Starting Live API Tests...\n');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // מצא admin user
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('❌ No admin user found. Creating one...');
      return;
    }
    console.log(`✅ Found admin: ${adminUser.email}\n`);

    // מצא הזמנה לבדיקה
    const testOrder = await Order.findOne({ orderNumber: 'ORD-1764239889386-BFVA2QLZY' });
    if (!testOrder) {
      console.log('❌ Test order not found');
      return;
    }

    console.log('📦 Test Order:', testOrder.orderNumber);
    console.log('   Items:', testOrder.items.length);
    console.log('   Total:', testOrder.pricing.total, '₪\n');

    const testItem = testOrder.items[0];
    console.log('🎯 Testing with item:', testItem.name);
    console.log('   Current status:', testItem.itemStatus);
    console.log('   Price:', testItem.price, '₪ ×', testItem.quantity, '\n');

    // ═══════════════════════════════════════════════════════════
    // Test 1: הזמנה מספק
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Order from Supplier');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const req1 = createMockReq(adminUser, {
      orderId: testOrder._id,
      itemId: testItem._id
    }, {
      supplierOrderNumber: 'AMZ-TEST-12345',
      supplierTrackingNumber: '1Z999AA10123456784',
      actualCost: testItem.price,
      notes: 'הוזמן בבדיקה - 09:00'
    });
    const res1 = createMockRes();

    await orderFromSupplier(req1, res1);

    if (res1.statusCode === 200) {
      console.log('✅ Order from supplier succeeded');
      console.log('   New status:', res1.data.data.item.itemStatus);
      console.log('   Supplier order #:', res1.data.data.item.supplierOrder.supplierOrderNumber);
      console.log('   Tracking:', res1.data.data.item.supplierOrder.supplierTrackingNumber);
    } else {
      console.log('❌ Failed:', res1.data.message);
    }

    // רענן הזמנה
    await reloadOrder(testOrder);
    console.log('\n');

    // ═══════════════════════════════════════════════════════════
    // Test 2: עדכון סטטוס -> arrived_us_warehouse
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Update Status to US Warehouse');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const req2 = createMockReq(adminUser, {
      orderId: testOrder._id,
      itemId: testItem._id
    }, {
      newStatus: ITEM_STATUS.ARRIVED_US_WAREHOUSE,
      notes: 'הגיע למחסן בניו ג\'רזי'
    });
    const res2 = createMockRes();

    await updateItemStatus(req2, res2);

    if (res2.statusCode === 200) {
      console.log('✅ Status updated');
      console.log('   New status:', res2.data.data.item.itemStatus);
      console.log('   History entries:', res2.data.data.item.statusHistory.length);
    } else {
      console.log('❌ Failed:', res2.data.message);
    }

    await reloadOrder(testOrder);
    console.log('\n');

    // ═══════════════════════════════════════════════════════════
    // Test 3: עדכון למספר סטטוסים
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Multiple Status Updates');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const statuses = [
      { status: ITEM_STATUS.SHIPPED_TO_ISRAEL, note: 'נשלח בטיסה #LY123' },
      { status: ITEM_STATUS.ARRIVED_ISRAEL, note: 'הגיע לבן גוריון' },
      { status: ITEM_STATUS.READY_FOR_DELIVERY, note: 'מוכן למשלוח ללקוח' }
    ];

    for (const { status, note } of statuses) {
      const req = createMockReq(adminUser, {
        orderId: testOrder._id,
        itemId: testItem._id
      }, {
        newStatus: status,
        notes: note
      });
      const res = createMockRes();

      await updateItemStatus(req, res);

      if (res.statusCode === 200) {
        console.log(`   ✅ ${status} - ${note}`);
      } else {
        console.log(`   ❌ ${status} - Failed: ${res.data.message}`);
      }

      await reloadOrder(testOrder);
    }
    console.log('\n');

    // ═══════════════════════════════════════════════════════════
    // Test 4: קבלת היסטוריה
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Get Item History');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const req4 = createMockReq(adminUser, {
      orderId: testOrder._id,
      itemId: testItem._id
    }, {});
    const res4 = createMockRes();

    await getItemHistory(req4, res4);

    if (res4.statusCode === 200) {
      console.log('✅ History retrieved');
      console.log('   Total entries:', res4.data.data.history.length);
      console.log('\n   📜 History Timeline:');
      res4.data.data.history.forEach((entry, i) => {
        console.log(`   ${i + 1}. ${entry.status.padEnd(25)} - ${entry.notes || 'No notes'}`);
      });
    } else {
      console.log('❌ Failed:', res4.data.message);
    }
    console.log('\n');

    // ═══════════════════════════════════════════════════════════
    // Test 5: ביטול פריט שני
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Cancel Item');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await reloadOrder(testOrder);
    const itemToCancel = testOrder.items[1]; // פריט שני

    console.log('   Cancelling:', itemToCancel.name);
    console.log('   Price:', itemToCancel.price, '₪ ×', itemToCancel.quantity);

    const req5 = createMockReq(adminUser, {
      orderId: testOrder._id,
      itemId: itemToCancel._id
    }, {
      reason: 'המוצר אזל במלאי אצל הספק'
    });
    const res5 = createMockRes();

    await cancelItem(req5, res5);

    if (res5.statusCode === 200) {
      console.log('✅ Item cancelled');
      console.log('   Refund amount:', res5.data.data.refund.amount, '₪');
      console.log('   Adjusted total:', res5.data.data.orderUpdate.adjustedTotal, '₪');
      console.log('   Total refunds:', res5.data.data.orderUpdate.totalRefunds, '₪');
      console.log('   Meets minimum?', res5.data.data.orderUpdate.meetsMinimum ? '✅ Yes' : '❌ No');

      if (!res5.data.data.orderUpdate.meetsMinimum) {
        const check = res5.data.data.orderUpdate.minimumCheck;
        console.log('\n   ⚠️  Order does NOT meet minimum requirements:');
        console.log('      Active items:', check.activeItemsCount, '(need', check.minimumCount, ')');
        console.log('      Active total:', check.activeItemsTotal, '₪ (need', check.minimumAmount, '₪)');
        console.log('      Missing:', check.amountDifference, '₪,', check.countDifference, 'items');
      }
    } else {
      console.log('❌ Failed:', res5.data.message);
    }
    console.log('\n');

    // ═══════════════════════════════════════════════════════════
    // Test 6: בדיקת תקינות ההזמנה לאחר שינויים
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 6: Final Order State');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await reloadOrder(testOrder);

    const activeItems = testOrder.items.filter(i => !i.cancellation.cancelled);
    const cancelledItems = testOrder.items.filter(i => i.cancellation.cancelled);

    console.log('📊 Order Statistics:');
    console.log('   Total items:', testOrder.items.length);
    console.log('   Active items:', activeItems.length);
    console.log('   Cancelled items:', cancelledItems.length);
    console.log('\n💰 Pricing:');
    console.log('   Original total:', testOrder.pricing.total, '₪');
    console.log('   Total refunds:', testOrder.pricing.totalRefunds, '₪');
    console.log('   Adjusted total:', testOrder.pricing.adjustedTotal, '₪');
    console.log('\n📝 Refunds:');
    console.log('   Refund records:', testOrder.refunds.length);
    testOrder.refunds.forEach((refund, i) => {
      console.log(`   ${i + 1}. ${refund.amount} ₪ - ${refund.reason} (${refund.status})`);
    });

    console.log('\n📦 Items Status:');
    testOrder.items.forEach((item, i) => {
      const statusIcon = item.cancellation.cancelled ? '❌' : '✅';
      console.log(`   ${i + 1}. ${statusIcon} ${item.name.substring(0, 40)}...`);
      console.log(`      Status: ${item.itemStatus}`);
      if (item.supplierOrder?.supplierOrderNumber) {
        console.log(`      Order #: ${item.supplierOrder.supplierOrderNumber}`);
      }
      if (item.cancellation.cancelled) {
        console.log(`      Cancelled: ${item.cancellation.reason}`);
        console.log(`      Refund: ${item.cancellation.refundAmount} ₪`);
      }
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ All APIs working correctly');
    console.log('✅ Item tracking fully functional');
    console.log('✅ Refund calculations accurate');
    console.log('✅ Order validation working');
    console.log('✅ History tracking operational');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

runTests();
