/**
 * Phase 7.2: Retry Mechanism Tests
 *
 * מטרה: לוודא שהמערכת מנסה שוב אחרי תקלות זמניות
 *
 * Tests:
 * - 7.2.1: Network Timeout Retry
 * - 7.2.2: Exponential Backoff
 * - 7.2.3: Max Retries Reached
 * - 7.2.4: Successful Retry
 * - 7.2.5: Non-Retryable Errors
 */

import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import { chargeReadyOrders } from '../src/jobs/chargeReadyOrders.js';
import { capturePayment, isRetryableError, calculateBackoff } from '../src/services/paymentService.js';
import * as hypPayClient from '../src/utils/hypPayClient.js';

describe('Phase 7.2: Retry Mechanism', () => {
  beforeEach(async () => {
    // Clean test orders
    await Order.deleteMany({ orderNumber: /^RETRY-TEST-/ });
  });

  afterEach(() => {
    // Restore mocks
    jest.restoreAllMocks();
  });

  /**
   * Helper: Create order in ready_to_charge status
   */
  const createReadyOrder = async (orderNumber = 'RETRY-TEST-001') => {
    return await Order.create({
      orderNumber,
      customer: {
        name: 'Test Customer',
        email: 'retry-customer@test.com',
        phone: '0501234567'
      },
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          title: 'Test Product',
          price: 500,
          itemStatus: 'ordered',
          supplierOrder: {
            supplierLink: 'https://amazon.com/test',
            supplierPrice: 400,
            supplierCurrency: 'USD',
            orderedAt: new Date()
          }
        }
      ],
      totals: {
        subtotal: 500,
        shippingCost: 0,
        finalTotal: 500
      },
      payment: {
        status: 'ready_to_charge',
        method: 'credit_card',
        hypTransactionId: 'MOCK-TRANS-RETRY-001',
        holdAmount: 500,
        retryCount: 0,
        maxRetries: 3,
        retryErrors: []
      },
      timeline: [
        {
          status: 'ready_to_charge',
          message: 'Ready for payment capture',
          timestamp: new Date()
        }
      ]
    });
  };

  /**
   * Test 7.2.1: Network Timeout Retry
   *
   * תרחיש:
   * 1. צור הזמנה ב-ready_to_charge
   * 2. Mock Hyp Pay להחזיר timeout
   * 3. הרץ chargeReadyOrders()
   * 4. בדוק שההזמנה עברה ל-retry_pending
   *
   * תוצאה צפויה:
   * - payment.status = retry_pending
   * - payment.retryCount = 1
   * - payment.nextRetryAt = עכשיו + 5 דקות
   * - retryErrors מכיל את השגיאה
   */
  describe('7.2.1 Network Timeout Retry', () => {
    it('should schedule retry after timeout error', async () => {
      // Setup
      const order = await createReadyOrder();

      // Mock timeout error
      const timeoutError = new Error('ETIMEDOUT');
      timeoutError.code = 'ETIMEDOUT';
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockRejectedValueOnce(timeoutError);

      // Execute
      const stats = await chargeReadyOrders();

      // Verify job stats
      expect(stats.processed).toBeGreaterThan(0);

      // Fetch updated order
      const updatedOrder = await Order.findById(order._id);

      // ✅ Should be in retry_pending
      expect(updatedOrder.payment.status).toBe('retry_pending');

      // ✅ Retry count incremented
      expect(updatedOrder.payment.retryCount).toBe(1);

      // ✅ nextRetryAt should be ~5 minutes from now
      expect(updatedOrder.payment.nextRetryAt).toBeDefined();
      const minutesUntilRetry =
        (updatedOrder.payment.nextRetryAt - Date.now()) / 60000;
      expect(minutesUntilRetry).toBeGreaterThan(4.5);
      expect(minutesUntilRetry).toBeLessThan(5.5);

      // ✅ lastRetryAt should be set
      expect(updatedOrder.payment.lastRetryAt).toBeDefined();

      // ✅ Error logged
      expect(updatedOrder.payment.retryErrors).toHaveLength(1);
      expect(updatedOrder.payment.retryErrors[0].error).toContain('ETIMEDOUT');
      expect(updatedOrder.payment.retryErrors[0].attempt).toBe(1);

      // ✅ Timeline updated
      const retryEvent = updatedOrder.timeline.find(
        e => e.type === 'payment_retry_scheduled'
      );
      expect(retryEvent).toBeDefined();
    });

    it('should recognize ECONNRESET as retryable', async () => {
      const order = await createReadyOrder('RETRY-TEST-002');

      const connectionError = new Error('socket hang up ECONNRESET');
      connectionError.code = 'ECONNRESET';
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockRejectedValueOnce(connectionError);

      await chargeReadyOrders();

      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('retry_pending');
      expect(updatedOrder.payment.retryCount).toBe(1);
    });
  });

  /**
   * Test 7.2.2: Exponential Backoff
   *
   * תרחיש:
   * 1. צור הזמנה
   * 2. Mock Hyp Pay להחזיר 500 error (3 פעמים)
   * 3. הרץ chargeReadyOrders() 3 פעמים
   *
   * תוצאה צפויה:
   * - Retry 1: nextRetryAt = +5 דקות
   * - Retry 2: nextRetryAt = +10 דקות
   * - Retry 3: nextRetryAt = +20 דקות
   */
  describe('7.2.2 Exponential Backoff', () => {
    it('should double wait time with each retry', async () => {
      const order = await createReadyOrder('RETRY-TEST-003');

      // Mock persistent 500 error
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockRejectedValue({
          response: { status: 500 },
          message: 'Internal Server Error'
        });

      const backoffTimes = [];

      // Perform 3 retries
      for (let i = 0; i < 3; i++) {
        // Set nextRetryAt to now (time to retry)
        await Order.findByIdAndUpdate(order._id, {
          'payment.nextRetryAt': new Date()
        });

        await chargeReadyOrders();

        const updatedOrder = await Order.findById(order._id);
        const minutes =
          (updatedOrder.payment.nextRetryAt - Date.now()) / 60000;
        backoffTimes.push(Math.round(minutes));
      }

      // ✅ Should follow exponential backoff: 5, 10, 20
      expect(backoffTimes[0]).toBeCloseTo(5, 0);
      expect(backoffTimes[1]).toBeCloseTo(10, 0);
      expect(backoffTimes[2]).toBeCloseTo(20, 0);
    });

    it('calculateBackoff helper should work correctly', () => {
      // retryCount 0 → 5 minutes
      expect(calculateBackoff(0)).toBe(5);

      // retryCount 1 → 10 minutes
      expect(calculateBackoff(1)).toBe(10);

      // retryCount 2 → 20 minutes
      expect(calculateBackoff(2)).toBe(20);

      // retryCount 3 → 40 minutes
      expect(calculateBackoff(3)).toBe(40);

      // retryCount 4 → 80 minutes
      expect(calculateBackoff(4)).toBe(80);
    });
  });

  /**
   * Test 7.2.3: Max Retries Reached
   *
   * תרחיש:
   * 1. צור הזמנה עם retryCount=2 (ניסיון אחרון)
   * 2. Mock Hyp Pay להחזיר 500 error
   * 3. הרץ chargeReadyOrders()
   *
   * תוצאה צפויה:
   * - payment.status = failed
   * - payment.retryCount = 3
   * - nextRetryAt = null
   * - timeline מכיל payment_failed
   */
  describe('7.2.3 Max Retries Reached', () => {
    it('should mark as failed after max retries', async () => {
      // Setup: Order with 2 previous retries (last attempt)
      const order = await Order.create({
        orderNumber: 'RETRY-TEST-004',
        customer: {
          name: 'Test Customer',
          email: 'retry-customer@test.com',
          phone: '0501234567'
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Test Product',
            price: 500,
            itemStatus: 'ordered',
            supplierOrder: {
              supplierLink: 'https://amazon.com/test',
              orderedAt: new Date()
            }
          }
        ],
        totals: {
          subtotal: 500,
          shippingCost: 0,
          finalTotal: 500
        },
        payment: {
          status: 'retry_pending',
          method: 'credit_card',
          hypTransactionId: 'MOCK-TRANS-004',
          holdAmount: 500,
          retryCount: 2, // Already tried twice
          maxRetries: 3,
          nextRetryAt: new Date(), // Ready to retry now
          retryErrors: [
            { attempt: 1, error: 'Timeout', timestamp: new Date() },
            { attempt: 2, error: 'Timeout', timestamp: new Date() }
          ]
        },
        timeline: []
      });

      // Mock another failure
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockRejectedValueOnce({
          response: { status: 503 },
          message: 'Service Unavailable'
        });

      // Execute
      await chargeReadyOrders();

      // Verify
      const updatedOrder = await Order.findById(order._id);

      // ✅ Should be marked as failed
      expect(updatedOrder.payment.status).toBe('failed');

      // ✅ Retry count should be at max
      expect(updatedOrder.payment.retryCount).toBe(3);

      // ✅ No more retries scheduled
      expect(updatedOrder.payment.nextRetryAt).toBeNull();

      // ✅ All 3 errors logged
      expect(updatedOrder.payment.retryErrors).toHaveLength(3);

      // ✅ Timeline shows failure
      const failedEvent = updatedOrder.timeline.find(
        e => e.type === 'payment_failed'
      );
      expect(failedEvent).toBeDefined();
      expect(failedEvent.message).toContain('after 3 retries');
    });
  });

  /**
   * Test 7.2.4: Successful Retry
   *
   * תרחיש:
   * 1. צור הזמנה ב-retry_pending עם retryCount=1
   * 2. Mock Hyp Pay להצליח הפעם
   * 3. הרץ chargeReadyOrders()
   *
   * תוצאה צפויה:
   * - payment.status = captured
   * - payment.retryCount = 0 (reset!)
   * - payment.nextRetryAt = null
   * - payment.chargedAmount = סכום נכון
   */
  describe('7.2.4 Successful Retry', () => {
    it('should reset retry counter on successful capture', async () => {
      // Setup: Order that failed once, ready to retry
      const order = await Order.create({
        orderNumber: 'RETRY-TEST-005',
        customer: {
          name: 'Test Customer',
          email: 'retry-customer@test.com',
          phone: '0501234567'
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Test Product',
            price: 500,
            itemStatus: 'ordered',
            supplierOrder: {
              supplierLink: 'https://amazon.com/test',
              orderedAt: new Date()
            }
          }
        ],
        totals: {
          subtotal: 500,
          shippingCost: 0,
          finalTotal: 500
        },
        payment: {
          status: 'retry_pending',
          method: 'credit_card',
          hypTransactionId: 'MOCK-TRANS-005',
          holdAmount: 500,
          retryCount: 1, // Failed once
          maxRetries: 3,
          nextRetryAt: new Date(), // Ready to retry
          lastRetryAt: new Date(Date.now() - 300000), // 5 min ago
          retryErrors: [
            { attempt: 1, error: 'Timeout', timestamp: new Date() }
          ]
        },
        timeline: []
      });

      // Mock successful capture this time
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockResolvedValueOnce({
          success: true,
          CCode: '0',
          Amount: 500,
          Id: 'TRANS-SUCCESS-123'
        });

      // Execute
      const stats = await chargeReadyOrders();

      // Verify
      expect(stats.success).toBeGreaterThan(0);

      const updatedOrder = await Order.findById(order._id);

      // ✅ Should be captured
      expect(updatedOrder.payment.status).toBe('captured');

      // ✅ Retry counter RESET
      expect(updatedOrder.payment.retryCount).toBe(0);

      // ✅ nextRetryAt cleared
      expect(updatedOrder.payment.nextRetryAt).toBeNull();

      // ✅ lastRetryAt cleared
      expect(updatedOrder.payment.lastRetryAt).toBeNull();

      // ✅ Amount charged
      expect(updatedOrder.payment.chargedAmount).toBe(500);

      // ✅ Timeline shows success
      const capturedEvent = updatedOrder.timeline.find(
        e => e.status === 'captured' || e.type === 'payment_captured'
      );
      expect(capturedEvent).toBeDefined();
    });
  });

  /**
   * Test 7.2.5: Non-Retryable Errors
   *
   * תרחיש:
   * 1. צור הזמנה
   * 2. Mock Hyp Pay להחזיר 400 error (בעיית קלט - לא ניתן לתקן)
   * 3. הרץ chargeReadyOrders()
   *
   * תוצאה צפויה:
   * - payment.status = failed מיד (לא retry)
   * - retryCount = 0 (לא ניסה שוב)
   */
  describe('7.2.5 Non-Retryable Errors', () => {
    it('should not retry on 400 Bad Request', async () => {
      const order = await createReadyOrder('RETRY-TEST-006');

      // Mock 400 error (client error, not server error)
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockRejectedValueOnce({
          response: { status: 400 },
          message: 'Invalid transaction ID'
        });

      await chargeReadyOrders();

      const updatedOrder = await Order.findById(order._id);

      // ✅ Should fail immediately
      expect(updatedOrder.payment.status).toBe('failed');

      // ✅ No retries attempted
      expect(updatedOrder.payment.retryCount).toBe(0);

      // ✅ No nextRetryAt
      expect(updatedOrder.payment.nextRetryAt).toBeUndefined();
    });

    it('should not retry on 401 Unauthorized', async () => {
      const order = await createReadyOrder('RETRY-TEST-007');

      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockRejectedValueOnce({
          response: { status: 401 },
          message: 'Unauthorized'
        });

      await chargeReadyOrders();

      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('failed');
      expect(updatedOrder.payment.retryCount).toBe(0);
    });

    it('isRetryableError should correctly identify errors', () => {
      // ✅ Retryable: Network errors
      expect(isRetryableError({ message: 'ETIMEDOUT' })).toBe(true);
      expect(isRetryableError({ message: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ message: 'network timeout' })).toBe(true);

      // ✅ Retryable: Server errors (5xx)
      expect(isRetryableError({ response: { status: 500 } })).toBe(true);
      expect(isRetryableError({ response: { status: 502 } })).toBe(true);
      expect(isRetryableError({ response: { status: 503 } })).toBe(true);
      expect(isRetryableError({ response: { status: 504 } })).toBe(true);

      // ✅ Retryable: Rate limit
      expect(isRetryableError({ response: { status: 429 } })).toBe(true);

      // ❌ Not retryable: Client errors (4xx)
      expect(isRetryableError({ response: { status: 400 } })).toBe(false);
      expect(isRetryableError({ response: { status: 401 } })).toBe(false);
      expect(isRetryableError({ response: { status: 404 } })).toBe(false);

      // ❌ Not retryable: Generic errors
      expect(isRetryableError({ message: 'Invalid input' })).toBe(false);
    });
  });

  /**
   * Test 7.2.6: Retry Query
   *
   * וודא שה-Job מוצא הזמנות retry_pending שהגיע זמנן
   */
  describe('7.2.6 Retry Query', () => {
    it('should find retry_pending orders when nextRetryAt passed', async () => {
      // Create order ready to retry
      const readyToRetry = await Order.create({
        orderNumber: 'RETRY-TEST-008',
        customer: {
          name: 'Test Customer',
          email: 'retry@test.com',
          phone: '0501234567'
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product',
            price: 500,
            itemStatus: 'ordered',
            supplierOrder: { orderedAt: new Date() }
          }
        ],
        totals: { subtotal: 500, shippingCost: 0, finalTotal: 500 },
        payment: {
          status: 'retry_pending',
          hypTransactionId: 'MOCK-008',
          holdAmount: 500,
          retryCount: 1,
          nextRetryAt: new Date(Date.now() - 1000) // 1 second ago
        },
        timeline: []
      });

      // Create order not ready yet
      const notReadyYet = await Order.create({
        orderNumber: 'RETRY-TEST-009',
        customer: {
          name: 'Test Customer',
          email: 'retry@test.com',
          phone: '0501234567'
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            title: 'Product',
            price: 500,
            itemStatus: 'ordered',
            supplierOrder: { orderedAt: new Date() }
          }
        ],
        totals: { subtotal: 500, shippingCost: 0, finalTotal: 500 },
        payment: {
          status: 'retry_pending',
          hypTransactionId: 'MOCK-009',
          holdAmount: 500,
          retryCount: 1,
          nextRetryAt: new Date(Date.now() + 300000) // 5 minutes from now
        },
        timeline: []
      });

      // Query used by chargeReadyOrders
      const ordersToRetry = await Order.find({
        $or: [
          { 'payment.status': 'ready_to_charge' },
          {
            'payment.status': 'retry_pending',
            'payment.nextRetryAt': { $lte: new Date() }
          }
        ],
        'payment.hypTransactionId': { $exists: true, $ne: null }
      });

      // ✅ Should find the ready-to-retry order
      const orderIds = ordersToRetry.map(o => o._id.toString());
      expect(orderIds).toContain(readyToRetry._id.toString());

      // ✅ Should NOT find the not-ready order
      expect(orderIds).not.toContain(notReadyYet._id.toString());
    });
  });
});
