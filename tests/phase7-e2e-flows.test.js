/**
 * Phase 7.5: End-to-End Flow Tests
 *
 * מטרה: לבדוק תרחישים מלאים מקצה לקצה
 *
 * Tests:
 * - 7.5.1: Complete Order Flow (hold → order → charge → delivery)
 * - 7.5.2: Partial Cancellation Flow (hold → cancel some → partial capture)
 * - 7.5.3: Retry Recovery Flow (fail → retry → success)
 * - 7.5.4: Multi-Server Scenario (concurrent processing)
 */

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Order from '../src/models/Order.js';
import User from '../src/models/User.js';
import Lock from '../src/models/Lock.js';
import { chargeReadyOrders } from '../src/jobs/chargeReadyOrders.js';
import * as hypPayClient from '../src/utils/hypPayClient.js';

describe('Phase 7.5: End-to-End Flows', () => {
  let adminToken;
  let adminUser;

  beforeAll(async () => {
    // Create admin user
    adminUser = await User.create({
      name: 'E2E Admin',
      email: 'admin-e2e@test.com',
      password: 'password123',
      role: 'admin'
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin-e2e@test.com',
        password: 'password123'
      });

    adminToken = loginRes.body.token;
  });

  afterAll(async () => {
    await User.deleteOne({ email: 'admin-e2e@test.com' });
  });

  beforeEach(async () => {
    await Order.deleteMany({ orderNumber: /^E2E-/ });
    await Lock.deleteMany({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Test 7.5.1: Complete Order Flow
   *
   * תרחיש מלא:
   * 1. לקוח יוצר הזמנה (3 פריטים, ₪1500)
   * 2. Hold credit card → payment.status = hold
   * 3. אדמין מזמין את כל הפריטים מספק
   * 4. payment.status → ready_to_charge
   * 5. Cron job רץ → Capture ₪1500
   * 6. payment.status = captured
   *
   * תוצאה צפויה:
   * - Hold: ₪1500
   * - Final charge: ₪1500
   * - כל הפריטים ordered
   * - Timeline מתעדכן נכון
   */
  describe('7.5.1 Complete Order Flow', () => {
    it('should complete full order lifecycle', async () => {
      // Step 1: Create order
      const order = await Order.create({
        orderNumber: 'E2E-COMPLETE-001',
        customer: {
          name: 'E2E Customer',
          email: 'e2e@test.com',
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
          },
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product 3',
            price: 500,
            itemStatus: 'pending',
            supplierOrder: {}
          }
        ],
        totals: {
          subtotal: 1500,
          shippingCost: 0,
          finalTotal: 1500
        },
        payment: {
          status: 'hold',
          method: 'credit_card',
          hypTransactionId: 'MOCK-E2E-001',
          holdAmount: 1500,
          hypAuthCode: '001234',  // J5 Protocol
          hypUid: 'UID-E2E-001'   // J5 Protocol
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

      // ✅ Step 2: Verify hold status
      expect(order.payment.status).toBe('hold');
      expect(order.payment.holdAmount).toBe(1500);

      // Step 3: Admin orders all items from supplier
      for (const item of order.items) {
        await request(app)
          .post(`/api/admin/orders/${order._id}/items/${item._id}/order-from-supplier`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            supplierLink: `https://amazon.com/${item.title}`,
            supplierPrice: 400,
            supplierCurrency: 'USD'
          });
      }

      // ✅ Step 4: Should be ready to charge
      let updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('ready_to_charge');
      expect(updatedOrder.items.every(item => item.itemStatus === 'ordered')).toBe(true);

      // Step 5: Mock successful capture
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockResolvedValueOnce({
          success: true,
          CCode: '0',
          Amount: 1500,
          Id: 'CAPTURE-E2E-001'
        });

      // Run charge job
      const stats = await chargeReadyOrders();

      // ✅ Step 6: Verify capture
      expect(stats.success).toBe(1);

      updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('captured');
      expect(updatedOrder.payment.chargedAmount).toBe(1500);

      // ✅ Verify timeline progression
      const statuses = updatedOrder.timeline.map(e => e.status);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('hold');
      expect(statuses).toContain('ready_to_charge');
      expect(statuses).toContain('captured');

      // ✅ Lock should be released
      const remainingLocks = await Lock.find({});
      expect(remainingLocks).toHaveLength(0);
    });
  });

  /**
   * Test 7.5.2: Partial Cancellation Flow
   *
   * תרחיש:
   * 1. לקוח מזמין 3 פריטים (₪1500)
   * 2. Hold ₪1500
   * 3. אדמין מזמין 2 פריטים
   * 4. אדמין מבטל פריט אחד
   * 5. Cron job → Partial capture ₪1000 (2 פריטים)
   *
   * תוצאה צפויה:
   * - Hold: ₪1500
   * - Final charge: ₪1000
   * - 1 פריט cancelled, 2 ordered
   */
  describe('7.5.2 Partial Cancellation Flow', () => {
    it('should handle partial cancellations correctly', async () => {
      const order = await Order.create({
        orderNumber: 'E2E-PARTIAL-001',
        customer: {
          name: 'E2E Customer',
          email: 'e2e@test.com',
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
          },
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product 3',
            price: 500,
            itemStatus: 'pending',
            supplierOrder: {}
          }
        ],
        totals: {
          subtotal: 1500,
          shippingCost: 0,
          finalTotal: 1500
        },
        payment: {
          status: 'hold',
          method: 'credit_card',
          hypTransactionId: 'MOCK-E2E-002',
          holdAmount: 1500,
          hypAuthCode: '002345',
          hypUid: 'UID-E2E-002'
        },
        timeline: []
      });

      // Order 2 items
      await request(app)
        .post(`/api/admin/orders/${order._id}/items/${order.items[0]._id}/order-from-supplier`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierLink: 'https://amazon.com/p1',
          supplierPrice: 400,
          supplierCurrency: 'USD'
        });

      await request(app)
        .post(`/api/admin/orders/${order._id}/items/${order.items[1]._id}/order-from-supplier`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierLink: 'https://amazon.com/p2',
          supplierPrice: 400,
          supplierCurrency: 'USD'
        });

      // Cancel 1 item
      await request(app)
        .post(`/api/admin/orders/${order._id}/items/${order.items[2]._id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Out of stock',
          cancelledBy: 'admin'
        });

      // ✅ Should be ready to charge with 2 items
      let updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('ready_to_charge');

      const orderedItems = updatedOrder.items.filter(i => i.itemStatus === 'ordered');
      const cancelledItems = updatedOrder.items.filter(i => i.cancellation?.cancelled);
      expect(orderedItems).toHaveLength(2);
      expect(cancelledItems).toHaveLength(1);

      // Mock partial capture (J5 Protocol)
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockResolvedValueOnce({
          success: true,
          CCode: '0',
          Amount: 1000,  // Only 2 items
          Id: 'CAPTURE-PARTIAL-001'
        });

      await chargeReadyOrders();

      // ✅ Verify partial charge
      updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('captured');
      expect(updatedOrder.payment.chargedAmount).toBe(1000);  // Not 1500!
      expect(updatedOrder.payment.holdAmount).toBe(1500);     // Hold was 1500
    });
  });

  /**
   * Test 7.5.3: Retry Recovery Flow
   *
   * תרחיש:
   * 1. הזמנה מוכנה לגביה
   * 2. Hyp Pay נכשל פעמיים (timeout)
   * 3. בפעם ה-3 - מצליח!
   *
   * תוצאה צפויה:
   * - 2 retries עם exponential backoff
   * - Retry #3 מצליח
   * - payment.status = captured
   * - retryCount = 0 (reset)
   */
  describe('7.5.3 Retry Recovery Flow', () => {
    it('should recover after retries', async () => {
      const order = await Order.create({
        orderNumber: 'E2E-RETRY-001',
        customer: {
          name: 'E2E Customer',
          email: 'e2e@test.com',
          phone: '0501234567'
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product',
            price: 500,
            itemStatus: 'ordered',
            supplierOrder: {
              supplierLink: 'https://amazon.com/test',
              orderedAt: new Date()
            }
          }
        ],
        totals: { subtotal: 500, shippingCost: 0, finalTotal: 500 },
        payment: {
          status: 'ready_to_charge',
          method: 'credit_card',
          hypTransactionId: 'MOCK-E2E-003',
          holdAmount: 500,
          retryCount: 0,
          maxRetries: 3
        },
        timeline: []
      });

      // Attempt 1: Timeout
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockRejectedValueOnce(new Error('ETIMEDOUT'));

      await chargeReadyOrders();

      let updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('retry_pending');
      expect(updatedOrder.payment.retryCount).toBe(1);

      // Attempt 2: Timeout again
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockRejectedValueOnce(new Error('ETIMEDOUT'));

      await Order.findByIdAndUpdate(order._id, {
        'payment.nextRetryAt': new Date()  // Ready to retry
      });

      await chargeReadyOrders();

      updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('retry_pending');
      expect(updatedOrder.payment.retryCount).toBe(2);

      // Attempt 3: Success!
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockResolvedValueOnce({
          success: true,
          CCode: '0',
          Amount: 500,
          Id: 'CAPTURE-RETRY-SUCCESS'
        });

      await Order.findByIdAndUpdate(order._id, {
        'payment.nextRetryAt': new Date()
      });

      await chargeReadyOrders();

      // ✅ Should be captured
      updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('captured');
      expect(updatedOrder.payment.retryCount).toBe(0);  // Reset!
      expect(updatedOrder.payment.chargedAmount).toBe(500);

      // ✅ Timeline shows the journey
      const retryEvents = updatedOrder.timeline.filter(
        e => e.type === 'payment_retry_scheduled'
      );
      expect(retryEvents.length).toBeGreaterThan(0);
    });
  });

  /**
   * Test 7.5.4: Multi-Server Scenario
   *
   * תרחיש:
   * 1. 5 הזמנות ב-ready_to_charge
   * 2. 3 servers מריצים chargeReadyOrders() במקביל
   * 3. וודא שכל הזמנה עובדה בדיוק פעם אחת
   *
   * תוצאה צפויה:
   * - 5 הזמנות חוייבו
   * - אין duplicate charges
   * - Work distributed between servers
   */
  describe('7.5.4 Multi-Server Scenario', () => {
    it('should handle 3 servers processing 5 orders', async () => {
      // Create 5 ready orders
      const orders = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          Order.create({
            orderNumber: `E2E-MULTI-00${i + 1}`,
            customer: {
              name: 'E2E Customer',
              email: 'e2e@test.com',
              phone: '0501234567'
            },
            items: [
              {
                productId: new mongoose.Types.ObjectId(),
                title: `Product ${i + 1}`,
                price: 500,
                itemStatus: 'ordered',
                supplierOrder: { orderedAt: new Date() }
              }
            ],
            totals: { subtotal: 500, shippingCost: 0, finalTotal: 500 },
            payment: {
              status: 'ready_to_charge',
              hypTransactionId: `MOCK-MULTI-00${i + 1}`,
              holdAmount: 500
            },
            timeline: []
          })
        )
      );

      // Mock capture
      let totalCaptures = 0;
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockImplementation(async () => {
          totalCaptures++;
          await new Promise(resolve => setTimeout(resolve, 50));
          return { success: true, CCode: '0', Amount: 500 };
        });

      // Run 3 servers in parallel
      const [stats1, stats2, stats3] = await Promise.all([
        chargeReadyOrders(),
        chargeReadyOrders(),
        chargeReadyOrders()
      ]);

      // ✅ All 5 orders processed
      const totalSuccess = stats1.success + stats2.success + stats3.success;
      expect(totalSuccess).toBe(5);

      // ✅ captureTransaction called exactly 5 times (not 15!)
      expect(totalCaptures).toBe(5);

      // ✅ All orders captured
      for (const order of orders) {
        const updated = await Order.findById(order._id);
        expect(updated.payment.status).toBe('captured');
      }

      // ✅ Work was distributed
      expect(stats1.success).toBeGreaterThan(0);
      expect(stats2.success + stats3.success).toBeGreaterThan(0);

      // ✅ Some were skipped (locked)
      const totalSkipped = stats1.skipped + stats2.skipped + stats3.skipped;
      expect(totalSkipped).toBeGreaterThan(0);
    });
  });

  /**
   * Test 7.5.5: Complete System Integration
   *
   * תרחיש מלא עם כל התכונות:
   * - Race conditions (concurrent admin updates)
   * - Retry mechanism (transient failure)
   * - Distributed locks (multi-server)
   * - Partial capture (cancellations)
   */
  describe('7.5.5 Complete System Integration', () => {
    it('should handle complex scenario with all features', async () => {
      // Create order with 4 items
      const order = await Order.create({
        orderNumber: 'E2E-INTEGRATION-001',
        customer: {
          name: 'Integration Test',
          email: 'integration@test.com',
          phone: '0501234567'
        },
        items: Array.from({ length: 4 }, (_, i) => ({
          productId: new mongoose.Types.ObjectId(),
          title: `Product ${i + 1}`,
          price: 400,
          itemStatus: 'pending',
          supplierOrder: {}
        })),
        totals: { subtotal: 1600, shippingCost: 0, finalTotal: 1600 },
        payment: {
          status: 'hold',
          hypTransactionId: 'MOCK-INTEGRATION-001',
          holdAmount: 1600,
          hypAuthCode: '123456',
          hypUid: 'UID-INT-001',
          retryCount: 0,
          maxRetries: 3
        },
        timeline: []
      });

      // Step 1: 2 admins order items concurrently (race condition test)
      await Promise.all([
        request(app)
          .post(`/api/admin/orders/${order._id}/items/${order.items[0]._id}/order-from-supplier`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ supplierLink: 'https://amazon.com/1', supplierPrice: 350, supplierCurrency: 'USD' }),
        request(app)
          .post(`/api/admin/orders/${order._id}/items/${order.items[1]._id}/order-from-supplier`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ supplierLink: 'https://amazon.com/2', supplierPrice: 350, supplierCurrency: 'USD' })
      ]);

      // Step 2: Order third item, cancel fourth
      await request(app)
        .post(`/api/admin/orders/${order._id}/items/${order.items[2]._id}/order-from-supplier`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ supplierLink: 'https://amazon.com/3', supplierPrice: 350, supplierCurrency: 'USD' });

      await request(app)
        .post(`/api/admin/orders/${order._id}/items/${order.items[3]._id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Out of stock', cancelledBy: 'admin' });

      // Verify ready_to_charge (race condition prevented)
      let updated = await Order.findById(order._id);
      expect(updated.payment.status).toBe('ready_to_charge');

      // Step 3: First capture attempt fails (retry test)
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockRejectedValueOnce({ response: { status: 503 } });

      await chargeReadyOrders();

      updated = await Order.findById(order._id);
      expect(updated.payment.status).toBe('retry_pending');
      expect(updated.payment.retryCount).toBe(1);

      // Step 4: Retry succeeds with partial capture (3 items, not 4)
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockResolvedValueOnce({ success: true, CCode: '0', Amount: 1200 });

      await Order.findByIdAndUpdate(order._id, {
        'payment.nextRetryAt': new Date()
      });

      // Run 2 servers (distributed lock test)
      const [stats1, stats2] = await Promise.all([
        chargeReadyOrders(),
        chargeReadyOrders()
      ]);

      // ✅ Only one server processed it
      expect(stats1.success + stats2.success).toBe(1);
      expect(stats1.skipped + stats2.skipped).toBeGreaterThan(0);

      // ✅ Final state
      updated = await Order.findById(order._id);
      expect(updated.payment.status).toBe('captured');
      expect(updated.payment.chargedAmount).toBe(1200);  // 3 items, not 4
      expect(updated.payment.retryCount).toBe(0);       // Reset after success

      console.log('✅ Complete integration test passed!');
    });
  });
});
