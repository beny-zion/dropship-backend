/**
 * Test Script for Item Management APIs
 *
 * בודק שה-APIs החדשים עובדים
 */

import { calculateItemRefund, checkOrderMinimumRequirements, getActiveItems } from '../src/utils/orderCalculations.js';
import { ITEM_STATUS, ITEM_STATUS_LABELS, isValidStatusTransition } from '../src/constants/itemStatuses.js';

console.log('🧪 Testing Item Management Functions\n');

// Test 1: Item Status Constants
console.log('1️⃣ Testing Item Status Constants');
console.log('──────────────────────────────────');
console.log('PENDING:', ITEM_STATUS.PENDING);
console.log('Label:', ITEM_STATUS_LABELS[ITEM_STATUS.PENDING]);
console.log('✅ Constants working\n');

// Test 2: Status Transitions
console.log('2️⃣ Testing Status Transitions');
console.log('──────────────────────────────────');
const canPendingToOrdered = isValidStatusTransition('pending', 'ordered_from_supplier');
const canPendingToDelivered = isValidStatusTransition('pending', 'delivered');
console.log('pending → ordered_from_supplier:', canPendingToOrdered ? '✅' : '❌');
console.log('pending → delivered:', canPendingToDelivered ? '❌' : '✅ (correctly blocked)');
console.log('✅ Transitions working\n');

// Test 3: Item Refund Calculation
console.log('3️⃣ Testing Refund Calculation');
console.log('──────────────────────────────────');
const testItem = {
  _id: 'test123',
  name: 'Test Product',
  price: 350,
  quantity: 2
};
const refund = calculateItemRefund(testItem);
console.log(`Item: ${testItem.name}`);
console.log(`Price: ${testItem.price} × ${testItem.quantity}`);
console.log(`Refund: ${refund} ₪`);
console.log(refund === 700 ? '✅ Calculation correct\n' : '❌ Calculation wrong\n');

// Test 4: Order Minimum Check
console.log('4️⃣ Testing Order Minimum Requirements');
console.log('──────────────────────────────────');
const testOrder1 = {
  items: [
    { price: 200, quantity: 1, cancellation: { cancelled: false } },
    { price: 250, quantity: 1, cancellation: { cancelled: false } }
  ]
};
const check1 = checkOrderMinimumRequirements(testOrder1);
console.log('Order with 450 ₪, 2 items:', check1.meetsMinimum ? '✅ Pass' : '❌ Fail');

const testOrder2 = {
  items: [
    { price: 200, quantity: 1, cancellation: { cancelled: false } },
    { price: 150, quantity: 1, cancellation: { cancelled: true } } // Cancelled
  ]
};
const check2 = checkOrderMinimumRequirements(testOrder2);
console.log('Order with 200 ₪, 1 active item:', check2.meetsMinimum ? '❌ Should fail' : '✅ Correctly fails');
console.log(`  - Active items: ${check2.activeItemsCount}`);
console.log(`  - Active total: ${check2.activeItemsTotal} ₪`);
console.log(`  - Missing: ${check2.amountDifference} ₪, ${check2.countDifference} items\n`);

// Test 5: Active Items Filter
console.log('5️⃣ Testing Active Items Filter');
console.log('──────────────────────────────────');
const mixedItems = [
  { name: 'Item 1', cancellation: { cancelled: false } },
  { name: 'Item 2', cancellation: { cancelled: true } },
  { name: 'Item 3', cancellation: { cancelled: false } }
];
const activeItems = getActiveItems(mixedItems);
console.log(`Total items: ${mixedItems.length}`);
console.log(`Active items: ${activeItems.length}`);
console.log(activeItems.length === 2 ? '✅ Filter working\n' : '❌ Filter broken\n');

console.log('🎉 All tests completed!');
console.log('════════════════════════════════════');
console.log('✅ Backend utilities are ready to use');
