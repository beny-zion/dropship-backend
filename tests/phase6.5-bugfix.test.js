/**
 * Phase 6.5 Bugfix Tests
 *
 * Tests for the critical bug fix:
 * - ORDERED_FROM_SUPPLIER was undefined, causing itemStatus to not be set
 * - Orders never transitioned to ready_to_charge
 * - Auto-charge job never ran
 * - Full amount was charged instead of adjusted amount
 *
 * The fix: Replace all ORDERED_FROM_SUPPLIER references with ORDERED
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import User from '../src/models/User.js';
import Product from '../src/models/Product.js';
import { ITEM_STATUS } from '../src/constants/itemStatuses.js';
import { areAllItemsDecided } from '../src/utils/paymentStatusUpdater.js';

// Mock payment service
jest.unstable_mockModule('../src/services/paymentService.js', () => ({
  holdCredit: jest.fn().mockResolvedValue({
    success: true,
    transactionId: 'TEST_HOLD_123',
    amount: 1000
  }),
  capturePayment: jest.fn().mockResolvedValue({
    success: true,
    transactionId: 'TEST_CHARGE_123',
    amount: 500
  })
}));

const paymentService = await import('../src/services/paymentService.js');

describe('Phase 6.5: Critical Bugfix - itemStatus Setting', () => {
  let testUser, testProduct1, testProduct2, testProduct3;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/amazon-dropship-test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up
    await Order.deleteMany({});
    await User.deleteMany({});
    await Product.deleteMany({});

    // Create test user
    testUser = await User.create({
      email: 'bugfix@test.com',
      password: 'Test123!@#',
      firstName: 'Bug',
      lastName: 'Fix',
      role: 'user'
    });

    // Create test products
    testProduct1 = await Product.create({
      name_he: 'מוצר בדיקה 1',
      name_en: 'Test Product 1',
      category: 'bags',
      price: { usd: 50, ils: 499 },
      images: ['test1.jpg']
    });

    testProduct2 = await Product.create({
      name_he: 'מוצר בדיקה 2',
      name_en: 'Test Product 2',
      category: 'bags',
      price: { usd: 20, ils: 199 },
      images: ['test2.jpg']
    });

    testProduct3 = await Product.create({
      name_he: 'מוצר בדיקה 3',
      name_en: 'Test Product 3',
      category: 'bags',
      price: { usd: 60, ils: 590 },
      images: ['test3.jpg']
    });
  });

  describe('Bug: ORDERED_FROM_SUPPLIER was undefined', () => {
    test('ITEM_STATUS.ORDERED should be defined and equal to "ordered"', () => {
      expect(ITEM_STATUS.ORDERED).toBeDefined();
      expect(ITEM_STATUS.ORDERED).toBe('ordered');
    });

    test('ITEM_STATUS.ORDERED_FROM_SUPPLIER should NOT exist', () => {
      expect(ITEM_STATUS.ORDERED_FROM_SUPPLIER).toBeUndefined();
    });

    test('Setting itemStatus with ORDERED should work correctly', async () => {
      const order = await Order.create({
        user: testUser._id,
        orderNumber: 'TEST-001',
        items: [{
          product: testProduct1._id,
          name: testProduct1.name_he,
          price: testProduct1.price.ils,
          quantity: 1,
          itemStatus: ITEM_STATUS.ORDERED // Should not be undefined
        }],
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          street: 'Test St',
          city: 'Test City',
          zipCode: '1234567'
        },
        pricing: {
          subtotal: 499,
          tax: 0,
          shipping: 49,
          total: 548
        },
        payment: {
          method: 'credit_card',
          status: 'pending'
        }
      });

      expect(order.items[0].itemStatus).toBe('ordered');
      expect(order.items[0].itemStatus).not.toBeUndefined();
    });
  });

  describe('Scenario: Partial Cancellation → Auto Charge', () => {
    test('Should transition to ready_to_charge when all items decided', async () => {
      // Create order with 3 items
      const order = await Order.create({
        user: testUser._id,
        orderNumber: 'TEST-PARTIAL-001',
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name_he,
            price: 499,
            quantity: 1,
            itemStatus: ITEM_STATUS.PENDING
          },
          {
            product: testProduct2._id,
            name: testProduct2.name_he,
            price: 199,
            quantity: 2,
            itemStatus: ITEM_STATUS.PENDING
          },
          {
            product: testProduct3._id,
            name: testProduct3.name_he,
            price: 590,
            quantity: 1,
            itemStatus: ITEM_STATUS.PENDING
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          street: 'Test St',
          city: 'Test City',
          zipCode: '1234567'
        },
        pricing: {
          subtotal: 1487,
          tax: 0,
          shipping: 49,
          total: 1536
        },
        payment: {
          method: 'credit_card',
          status: 'hold',
          holdAmount: 1536,
          hypTransactionId: 'TEST_HOLD_123'
        }
      });

      // Verify initial state
      expect(order.payment.status).toBe('hold');
      expect(areAllItemsDecided(order)).toBe(false);

      // Cancel first item
      order.items[0].itemStatus = ITEM_STATUS.CANCELLED;
      order.items[0].cancellation = {
        cancelled: true,
        reason: 'Test cancellation',
        cancelledAt: new Date(),
        cancelledBy: testUser._id,
        refundAmount: 499
      };

      await order.save();

      // Still not ready - only 1/3 items decided
      let reloaded = await Order.findById(order._id);
      expect(reloaded.payment.status).toBe('hold');
      expect(areAllItemsDecided(reloaded)).toBe(false);

      // Order second item from supplier
      reloaded.items[1].itemStatus = ITEM_STATUS.ORDERED;
      reloaded.items[1].supplierOrder = {
        orderedAt: new Date(),
        orderedBy: testUser._id,
        supplierOrderNumber: 'SUP-001',
        actualCost: 199
      };

      await reloaded.save();

      // Still not ready - only 2/3 items decided
      reloaded = await Order.findById(order._id);
      expect(reloaded.payment.status).toBe('hold');
      expect(areAllItemsDecided(reloaded)).toBe(false);

      // Order third item from supplier
      reloaded.items[2].itemStatus = ITEM_STATUS.ORDERED;
      reloaded.items[2].supplierOrder = {
        orderedAt: new Date(),
        orderedBy: testUser._id,
        supplierOrderNumber: 'SUP-002',
        actualCost: 590
      };

      await reloaded.save();

      // Now ALL items decided - should transition to ready_to_charge
      reloaded = await Order.findById(order._id);
      expect(reloaded.payment.status).toBe('ready_to_charge');
      expect(areAllItemsDecided(reloaded)).toBe(true);

      // Verify itemStatus is properly set for all items
      expect(reloaded.items[0].itemStatus).toBe('cancelled');
      expect(reloaded.items[1].itemStatus).toBe('ordered');
      expect(reloaded.items[2].itemStatus).toBe('ordered');

      // No undefined values
      expect(reloaded.items[1].itemStatus).not.toBeUndefined();
      expect(reloaded.items[2].itemStatus).not.toBeUndefined();
    });

    test('calculateFinalAmount should exclude cancelled items', async () => {
      const { calculateFinalAmount } = await import('../src/services/paymentService.js');

      const order = await Order.create({
        user: testUser._id,
        orderNumber: 'TEST-CALC-001',
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name_he,
            price: 499,
            quantity: 1,
            itemStatus: ITEM_STATUS.CANCELLED,
            cancellation: {
              cancelled: true,
              refundAmount: 499
            }
          },
          {
            product: testProduct2._id,
            name: testProduct2.name_he,
            price: 199,
            quantity: 2,
            itemStatus: ITEM_STATUS.ORDERED
          },
          {
            product: testProduct3._id,
            name: testProduct3.name_he,
            price: 590,
            quantity: 1,
            itemStatus: ITEM_STATUS.ORDERED
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          street: 'Test St',
          city: 'Test City',
          zipCode: '1234567'
        },
        pricing: {
          subtotal: 1487,
          tax: 0,
          shipping: 49,
          total: 1536
        },
        payment: {
          method: 'credit_card',
          status: 'ready_to_charge',
          holdAmount: 1536
        }
      });

      const finalAmount = calculateFinalAmount(order);

      // Should charge: (199 * 2) + 590 + 49 = 1037
      // Should NOT include cancelled item (499)
      expect(finalAmount).toBe(1037);
      expect(finalAmount).not.toBe(1536); // Original total
    });
  });

  describe('Edge Cases', () => {
    test('All items cancelled → should not charge', async () => {
      const { calculateFinalAmount } = await import('../src/services/paymentService.js');

      const order = await Order.create({
        user: testUser._id,
        orderNumber: 'TEST-ALL-CANCEL-001',
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name_he,
            price: 499,
            quantity: 1,
            itemStatus: ITEM_STATUS.CANCELLED,
            cancellation: { cancelled: true }
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          street: 'Test St',
          city: 'Test City',
          zipCode: '1234567'
        },
        pricing: {
          subtotal: 499,
          tax: 0,
          shipping: 49,
          total: 548
        },
        payment: {
          method: 'credit_card',
          status: 'hold',
          holdAmount: 548
        }
      });

      const finalAmount = calculateFinalAmount(order);
      expect(finalAmount).toBe(0);
    });

    test('No cancellations → should charge full amount', async () => {
      const { calculateFinalAmount } = await import('../src/services/paymentService.js');

      const order = await Order.create({
        user: testUser._id,
        orderNumber: 'TEST-FULL-001',
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name_he,
            price: 499,
            quantity: 1,
            itemStatus: ITEM_STATUS.ORDERED
          },
          {
            product: testProduct2._id,
            name: testProduct2.name_he,
            price: 199,
            quantity: 1,
            itemStatus: ITEM_STATUS.ORDERED
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          street: 'Test St',
          city: 'Test City',
          zipCode: '1234567'
        },
        pricing: {
          subtotal: 698,
          tax: 0,
          shipping: 49,
          total: 747
        },
        payment: {
          method: 'credit_card',
          status: 'ready_to_charge',
          holdAmount: 747
        }
      });

      const finalAmount = calculateFinalAmount(order);
      expect(finalAmount).toBe(747);
    });
  });

  describe('Pre-save Hook Behavior', () => {
    test('Hook should detect all items decided and update status', async () => {
      const order = new Order({
        user: testUser._id,
        orderNumber: 'TEST-HOOK-001',
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name_he,
            price: 499,
            quantity: 1,
            itemStatus: ITEM_STATUS.ORDERED
          },
          {
            product: testProduct2._id,
            name: testProduct2.name_he,
            price: 199,
            quantity: 1,
            itemStatus: ITEM_STATUS.ORDERED
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          street: 'Test St',
          city: 'Test City',
          zipCode: '1234567'
        },
        pricing: {
          subtotal: 698,
          tax: 0,
          shipping: 49,
          total: 747
        },
        payment: {
          method: 'credit_card',
          status: 'hold',
          holdAmount: 747,
          hypTransactionId: 'TEST_123'
        }
      });

      await order.save();

      // Hook should have transitioned to ready_to_charge
      const saved = await Order.findById(order._id);
      expect(saved.payment.status).toBe('ready_to_charge');
    });

    test('Hook should NOT trigger if payment status is not hold', async () => {
      const order = new Order({
        user: testUser._id,
        orderNumber: 'TEST-HOOK-002',
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name_he,
            price: 499,
            quantity: 1,
            itemStatus: ITEM_STATUS.ORDERED
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          street: 'Test St',
          city: 'Test City',
          zipCode: '1234567'
        },
        pricing: {
          subtotal: 499,
          tax: 0,
          shipping: 49,
          total: 548
        },
        payment: {
          method: 'credit_card',
          status: 'pending' // Not 'hold'
        }
      });

      await order.save();

      const saved = await Order.findById(order._id);
      expect(saved.payment.status).toBe('pending');
      expect(saved.payment.status).not.toBe('ready_to_charge');
    });
  });
});
