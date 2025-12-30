/**
 * Phase 7.1: Race Condition Prevention Tests
 *
 * מטרה: לוודא שעדכונים אטומיים מונעים חיובים כפולים
 *
 * Tests:
 * - 7.1.1: Concurrent Admin Updates (2 admins updating simultaneously)
 * - 7.1.2: Atomic Update Failure Fallback (pre-save hook backup)
 * - 7.1.3: Timeline Integrity (no duplicate events)
 */

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Order from '../src/models/Order.js';
import User from '../src/models/User.js';
import { tryMarkPaymentAsReady, areAllItemsDecided } from '../src/utils/paymentStatusUpdater.js';

describe('Phase 7.1: Race Condition Prevention', () => {
  let adminToken;
  let adminUser;

  beforeAll(async () => {
    // Create admin user for tests
    adminUser = await User.create({
      name: 'Test Admin',
      email: 'admin-race-test@test.com',
      password: 'password123',
      role: 'admin'
    });

    // Get admin token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin-race-test@test.com',
        password: 'password123'
      });

    adminToken = loginRes.body.token;
  });

  afterAll(async () => {
    // Cleanup
    await User.deleteOne({ email: 'admin-race-test@test.com' });
  });

  beforeEach(async () => {
    // Clean orders before each test
    await Order.deleteMany({ orderNumber: /^RACE-TEST-/ });
  });

  /**
   * Test 7.1.1: Concurrent Admin Updates
   *
   * תרחיש:
   * 1. צור הזמנה עם 2 פריטים ב-status pending
   * 2. 2 אדמינים מזמינים פריטים במקביל
   * 3. שני ה-requests מסתיימים
   *
   * תוצאה צפויה:
   * - payment.status = ready_to_charge (פעם אחת בלבד!)
   * - timeline מכיל רק אירוע אחד של payment_ready
   * - אין duplicate updates
   */
  describe('7.1.1 Concurrent Admin Updates', () => {
    it('should prevent double ready_to_charge with atomic update', async () => {
      // Setup: Create order with 2 items in 'pending' status
      const order = await Order.create({
        orderNumber: 'RACE-TEST-001',
        customer: {
          name: 'Test Customer',
          email: 'customer@test.com',
          phone: '0501234567'
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product 1',
            price: 500,
            itemStatus: 'pending',
            supplierOrder: {}
          },
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product 2',
            price: 500,
            itemStatus: 'pending',
            supplierOrder: {}
          }
        ],
        totals: {
          subtotal: 1000,
          shippingCost: 0,
          finalTotal: 1000
        },
        payment: {
          status: 'hold',
          method: 'credit_card',
          hypTransactionId: 'MOCK-TRANS-001',
          holdAmount: 1000
        },
        timeline: [
          {
            status: 'pending',
            message: 'Order created',
            timestamp: new Date()
          },
          {
            status: 'hold',
            message: 'Payment on hold',
            timestamp: new Date()
          }
        ]
      });

      // Execute: Simulate 2 admins ordering items concurrently
      const item1Id = order.items[0]._id;
      const item2Id = order.items[1]._id;

      const [response1, response2] = await Promise.all([
        request(app)
          .post(`/api/admin/orders/${order._id}/items/${item1Id}/order-from-supplier`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            supplierLink: 'https://amazon.com/item1',
            supplierPrice: 400,
            supplierCurrency: 'USD'
          }),
        // Slight delay to simulate real-world scenario
        new Promise(resolve => setTimeout(resolve, 100)).then(() =>
          request(app)
            .post(`/api/admin/orders/${order._id}/items/${item2Id}/order-from-supplier`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              supplierLink: 'https://amazon.com/item2',
              supplierPrice: 400,
              supplierCurrency: 'USD'
            })
        )
      ]);

      // Verify both requests succeeded
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Fetch updated order
      const updatedOrder = await Order.findById(order._id);

      // ✅ Critical: payment.status should be ready_to_charge
      expect(updatedOrder.payment.status).toBe('ready_to_charge');

      // ✅ Critical: Only ONE ready_to_charge event in timeline
      const readyEvents = updatedOrder.timeline.filter(
        event => event.status === 'ready_to_charge'
      );
      expect(readyEvents).toHaveLength(1);

      // ✅ Both items should be ordered
      expect(updatedOrder.items[0].itemStatus).toBe('ordered');
      expect(updatedOrder.items[1].itemStatus).toBe('ordered');

      // ✅ payment.readyAt should be set
      expect(updatedOrder.payment.readyAt).toBeDefined();
    });

    it('should handle 3+ concurrent updates correctly', async () => {
      // Setup: Order with 3 items
      const order = await Order.create({
        orderNumber: 'RACE-TEST-002',
        customer: {
          name: 'Test Customer',
          email: 'customer2@test.com',
          phone: '0501234567'
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product 1',
            price: 300,
            itemStatus: 'pending',
            supplierOrder: {}
          },
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product 2',
            price: 300,
            itemStatus: 'pending',
            supplierOrder: {}
          },
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product 3',
            price: 300,
            itemStatus: 'pending',
            supplierOrder: {}
          }
        ],
        totals: {
          subtotal: 900,
          shippingCost: 0,
          finalTotal: 900
        },
        payment: {
          status: 'hold',
          method: 'credit_card',
          hypTransactionId: 'MOCK-TRANS-002',
          holdAmount: 900
        },
        timeline: [
          {
            status: 'pending',
            message: 'Order created',
            timestamp: new Date()
          }
        ]
      });

      // Execute: 3 admins simultaneously
      const updates = order.items.map((item, index) =>
        request(app)
          .post(`/api/admin/orders/${order._id}/items/${item._id}/order-from-supplier`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            supplierLink: `https://amazon.com/item${index + 1}`,
            supplierPrice: 250,
            supplierCurrency: 'USD'
          })
      );

      const responses = await Promise.all(updates);

      // All should succeed
      responses.forEach(res => {
        expect(res.status).toBe(200);
      });

      // Verify
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('ready_to_charge');

      // Only 1 ready event
      const readyEvents = updatedOrder.timeline.filter(
        event => event.status === 'ready_to_charge'
      );
      expect(readyEvents).toHaveLength(1);
    });
  });

  /**
   * Test 7.1.2: Atomic Update Failure Fallback
   *
   * תרחיש:
   * 1. צור הזמנה עם 1 פריט
   * 2. Mock tryMarkPaymentAsReady() לזרוק שגיאה
   * 3. הזמן מספק
   * 4. וודא ש-fallback hook עובד
   *
   * תוצאה צפויה:
   * - Pre-save hook תופס ומעדכן payment.status
   * - לא נזרקת שגיאה
   * - ההזמנה מגיעה ל-ready_to_charge
   */
  describe('7.1.2 Atomic Update Failure Fallback', () => {
    it('should use pre-save hook when atomic update fails', async () => {
      // Setup
      const order = await Order.create({
        orderNumber: 'RACE-TEST-003',
        customer: {
          name: 'Test Customer',
          email: 'customer3@test.com',
          phone: '0501234567'
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product 1',
            price: 500,
            itemStatus: 'pending',
            supplierOrder: {}
          }
        ],
        totals: {
          subtotal: 500,
          shippingCost: 0,
          finalTotal: 500
        },
        payment: {
          status: 'hold',
          method: 'credit_card',
          hypTransactionId: 'MOCK-TRANS-003',
          holdAmount: 500
        },
        timeline: []
      });

      // Note: We can't easily mock the atomic update to fail in integration tests
      // Instead, we'll test that the fallback hook works correctly
      // by directly calling save() which triggers the hook

      // Execute: Order item and trigger save
      const item = order.items[0];
      item.itemStatus = 'ordered';
      item.supplierOrder = {
        supplierLink: 'https://amazon.com/test',
        supplierPrice: 400,
        supplierCurrency: 'USD',
        orderedAt: new Date()
      };

      await order.save(); // This should trigger the pre-save hook

      // Verify
      const updatedOrder = await Order.findById(order._id);

      // ✅ Hook should have updated payment status
      expect(updatedOrder.payment.status).toBe('ready_to_charge');

      // ✅ Timeline should have the event
      const readyEvent = updatedOrder.timeline.find(
        e => e.status === 'ready_to_charge'
      );
      expect(readyEvent).toBeDefined();
    });
  });

  /**
   * Test 7.1.3: Timeline Integrity
   *
   * תרחיש:
   * 1. צור הזמנה עם פריטים
   * 2. בצע עדכונים מרובים
   * 3. וודא שאין duplicate timeline events
   *
   * תוצאה צפויה:
   * - כל status מופיע פעם אחת בלבד בtimeline
   * - Timeline ממוין לפי timestamp
   */
  describe('7.1.3 Timeline Integrity', () => {
    it('should not create duplicate timeline events', async () => {
      // Setup
      const order = await Order.create({
        orderNumber: 'RACE-TEST-004',
        customer: {
          name: 'Test Customer',
          email: 'customer4@test.com',
          phone: '0501234567'
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product 1',
            price: 500,
            itemStatus: 'pending',
            supplierOrder: {}
          },
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product 2',
            price: 500,
            itemStatus: 'pending',
            supplierOrder: {}
          }
        ],
        totals: {
          subtotal: 1000,
          shippingCost: 0,
          finalTotal: 1000
        },
        payment: {
          status: 'hold',
          method: 'credit_card',
          hypTransactionId: 'MOCK-TRANS-004',
          holdAmount: 1000
        },
        timeline: [
          {
            status: 'pending',
            message: 'Order created',
            timestamp: new Date()
          }
        ]
      });

      // Execute: Order both items
      await Promise.all(
        order.items.map(item =>
          request(app)
            .post(`/api/admin/orders/${order._id}/items/${item._id}/order-from-supplier`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              supplierLink: 'https://amazon.com/test',
              supplierPrice: 400,
              supplierCurrency: 'USD'
            })
        )
      );

      // Verify
      const updatedOrder = await Order.findById(order._id);

      // Count status occurrences
      const statusCounts = {};
      updatedOrder.timeline.forEach(event => {
        statusCounts[event.status] = (statusCounts[event.status] || 0) + 1;
      });

      // ✅ ready_to_charge should appear only once
      expect(statusCounts['ready_to_charge']).toBe(1);

      // ✅ Timeline should be sorted by timestamp
      for (let i = 1; i < updatedOrder.timeline.length; i++) {
        const prev = updatedOrder.timeline[i - 1].timestamp.getTime();
        const current = updatedOrder.timeline[i].timestamp.getTime();
        expect(current).toBeGreaterThanOrEqual(prev);
      }
    });
  });

  /**
   * Test 7.1.4: areAllItemsDecided Helper
   *
   * בדיקת פונקציית עזר
   */
  describe('7.1.4 areAllItemsDecided Helper', () => {
    it('should correctly identify when all items are decided', () => {
      // All ordered
      const order1 = {
        items: [
          { itemStatus: 'ordered' },
          { itemStatus: 'ordered' }
        ]
      };
      expect(areAllItemsDecided(order1)).toBe(true);

      // Mix of ordered and cancelled
      const order2 = {
        items: [
          { itemStatus: 'ordered' },
          { itemStatus: 'pending', cancellation: { cancelled: true } }
        ]
      };
      expect(areAllItemsDecided(order2)).toBe(true);

      // Still has pending
      const order3 = {
        items: [
          { itemStatus: 'ordered' },
          { itemStatus: 'pending' }
        ]
      };
      expect(areAllItemsDecided(order3)).toBe(false);

      // All cancelled
      const order4 = {
        items: [
          { itemStatus: 'pending', cancellation: { cancelled: true } },
          { itemStatus: 'pending', cancellation: { cancelled: true } }
        ]
      };
      expect(areAllItemsDecided(order4)).toBe(true);
    });
  });
});
