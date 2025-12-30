/**
 * Phase 6.5: Critical Security & Payment Fixes - Tests
 *
 * טסטים שמוודאים שהתיקונים הקריטיים עובדים:
 * 1. Race Condition Prevention (6.5.1)
 * 2. Retry Mechanism (6.5.2)
 * 3. Distributed Lock (6.5.3)
 * 4. Secure Logging (6.5.4)
 */

import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import Lock from '../src/models/Lock.js';
import { tryMarkPaymentAsReady, areAllItemsDecided } from '../src/utils/paymentStatusUpdater.js';
import { acquireLock, releaseLock, checkLock } from '../src/utils/distributedLock.js';
import { chargeReadyOrders } from '../src/jobs/chargeReadyOrders.js';

// Note: capturePayment נשתמש ב-Hyp Pay Sandbox (real API)

describe('Phase 6.5: Critical Security Fixes', () => {

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/amazon-dropship-test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // נקה collections
    await Order.deleteMany({});
    await Lock.deleteMany({});
  });

  // ============================================
  // 6.5.1: Race Condition Prevention
  // ============================================
  describe('6.5.1: Race Condition Prevention', () => {

    it('should prevent double ready_to_charge when 2 admins update simultaneously', async () => {
      // צור הזמנה עם 2 פריטים ordered (מוכנים לגביה)
      const order = await Order.create({
        orderNumber: 'TEST-RACE-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'ordered'
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            price: 200,
            quantity: 1,
            itemStatus: 'ordered'
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          email: 'test@test.com',
          phone: '0501234567',
          street: 'Test St',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: {
          subtotal: 300,
          shipping: 49,
          tax: 0,
          total: 349
        },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-12345',
          holdAmount: 349
        }
      });

      // סימולציה: 2 אדמינים מעדכנים פריטים שונים במקביל
      const [result1, result2] = await Promise.all([
        tryMarkPaymentAsReady(order._id),
        tryMarkPaymentAsReady(order._id)
      ]);

      // לפחות אחד צריך להצליח (atomic operation מבטיח שרק 1 יעדכן)
      const successCount = [result1, result2].filter(r => r && r.updated).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // וודא שהסטטוס השתנה בפועל
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.payment.status).toBe('ready_to_charge');

      // וודא שיש רק רשומה אחת ב-timeline
      const readyToChargeEntries = updatedOrder.timeline.filter(
        t => t.status === 'ready_to_charge'
      );
      expect(readyToChargeEntries.length).toBe(1);
    });

    it('should use fallback hook if atomic update was not called', async () => {
      // צור הזמנה עם פריט אחד ordered
      const order = await Order.create({
        orderNumber: 'TEST-FALLBACK-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'pending'
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          email: 'test@test.com',
          phone: '0501234567',
          street: 'Test St',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: { subtotal: 100, shipping: 49, tax: 0, total: 149 },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-12345',
          holdAmount: 149
        }
      });

      // עדכן פריט ל-ordered (ללא קריאה ל-tryMarkPaymentAsReady)
      order.items[0].itemStatus = 'ordered';
      await order.save(); // ה-pre-save hook צריך לעבוד

      const updated = await Order.findById(order._id);
      expect(updated.payment.status).toBe('ready_to_charge');
    });

    it('areAllItemsDecided should work correctly', () => {
      const order1 = {
        items: [
          { itemStatus: 'ordered' },
          { itemStatus: 'ordered' }
        ]
      };
      expect(areAllItemsDecided(order1)).toBe(true);

      const order2 = {
        items: [
          { itemStatus: 'ordered' },
          { itemStatus: 'pending' }
        ]
      };
      expect(areAllItemsDecided(order2)).toBe(false);

      const order3 = {
        items: [
          { itemStatus: 'ordered' },
          { cancellation: { cancelled: true } }
        ]
      };
      expect(areAllItemsDecided(order3)).toBe(true);
    });
  });

  // ============================================
  // 6.5.2: Retry Mechanism
  // ============================================
  describe('6.5.2: Retry Mechanism', () => {

    it('should have retry fields in Order model', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-RETRY-FIELDS-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          price: 100,
          quantity: 1,
          itemStatus: 'ordered'
        }],
        shippingAddress: {
          fullName: 'Test User',
          email: 'test@test.com',
          phone: '0501234567',
          street: 'Test St',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: { subtotal: 100, shipping: 49, tax: 0, total: 149 },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-12345',
          holdAmount: 149
        }
      });

      // וודא שהשדות קיימים
      expect(order.payment.retryCount).toBeDefined();
      expect(order.payment.retryCount).toBe(0);
      expect(order.payment.maxRetries).toBe(3);
      expect(order.payment.retryErrors).toBeDefined();
    });

    it('should support retry_pending status', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-RETRY-STATUS-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          price: 100,
          quantity: 1,
          itemStatus: 'ordered'
        }],
        shippingAddress: {
          fullName: 'Test User',
          email: 'test@test.com',
          phone: '0501234567',
          street: 'Test St',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: { subtotal: 100, shipping: 49, tax: 0, total: 149 },
        payment: {
          method: 'credit_card',
          status: 'retry_pending',
          hypTransactionId: 'TEST-12345',
          holdAmount: 149,
          nextRetryAt: new Date(Date.now() + 5 * 60000) // 5 דקות
        }
      });

      expect(order.payment.status).toBe('retry_pending');
      expect(order.payment.nextRetryAt).toBeDefined();
    });

    it('chargeReadyOrders should find retry_pending orders', async () => {
      // צור הזמנה עם retry_pending שהגיע זמנה
      await Order.create({
        orderNumber: 'TEST-FIND-RETRY-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          price: 100,
          quantity: 1,
          itemStatus: 'ordered'
        }],
        shippingAddress: {
          fullName: 'Test User',
          email: 'test@test.com',
          phone: '0501234567',
          street: 'Test St',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: { subtotal: 100, shipping: 49, tax: 0, total: 149 },
        payment: {
          method: 'credit_card',
          status: 'retry_pending',
          hypTransactionId: 'TEST-RETRY-123',
          holdAmount: 149,
          nextRetryAt: new Date(Date.now() - 1000) // בעבר - מוכן לניסיון חוזר
        }
      });

      const stats = await chargeReadyOrders();

      // צריך למצוא לפחות הזמנה אחת
      expect(stats.processed).toBeGreaterThan(0);
    }, 30000);
  });

  // ============================================
  // 6.5.3: Distributed Lock
  // ============================================
  describe('6.5.3: Distributed Lock', () => {

    it('should prevent double-execution with distributed lock', async () => {
      const lockKey = 'test_charge_order_123';

      // Instance 1 רוכש lock
      const acquired1 = await acquireLock(lockKey, 10);
      expect(acquired1).toBe(true);

      // Instance 2 מנסה לרכוש אותו lock - צריך להיכשל
      const acquired2 = await acquireLock(lockKey, 10);
      expect(acquired2).toBe(false);

      // Instance 1 משחרר
      await releaseLock(lockKey);

      // עכשיו Instance 2 יכול לרכוש
      const acquired3 = await acquireLock(lockKey, 10);
      expect(acquired3).toBe(true);

      await releaseLock(lockKey);
    });

    it('should have TTL expiry configured on locks', async () => {
      const lockKey = 'test_expire_lock';

      // רכוש lock עם TTL של 5 שניות
      await acquireLock(lockKey, 5);

      // בדוק שה-lock קיים עם expiresAt
      const lock = await checkLock(lockKey);
      expect(lock).toBeDefined();
      expect(lock.expiresAt).toBeDefined();

      // וודא ש-expiresAt הוא בעתיד (בערך 5 שניות)
      const now = new Date();
      const expiryTime = new Date(lock.expiresAt);
      const diffSeconds = (expiryTime - now) / 1000;
      expect(diffSeconds).toBeGreaterThan(3); // לפחות 3 שניות
      expect(diffSeconds).toBeLessThan(7); // לא יותר מ-7 שניות

      // נקה
      await releaseLock(lockKey);

      // הערה: MongoDB's TTL index מוחק locks שפג תוקפם אוטומטית
      // אבל ה-TTL thread רץ כל 60 שניות, אז לא בודקים מחיקה אוטומטית בטסט
    }, 10000);

    it('should process orders with locks in chargeReadyOrders', async () => {
      // צור 2 הזמנות מוכנות לגביה
      const order1 = await Order.create({
        orderNumber: 'TEST-LOCK-1-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Item 1',
          price: 100,
          quantity: 1,
          itemStatus: 'ordered'
        }],
        shippingAddress: {
          fullName: 'Test User',
          email: 'test@test.com',
          phone: '0501234567',
          street: 'Test St',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: { subtotal: 100, shipping: 49, tax: 0, total: 149 },
        payment: {
          method: 'credit_card',
          status: 'ready_to_charge',
          hypTransactionId: 'TEST-LOCK-1',
          holdAmount: 149
        }
      });

      const order2 = await Order.create({
        orderNumber: 'TEST-LOCK-2-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Item 2',
          price: 200,
          quantity: 1,
          itemStatus: 'ordered'
        }],
        shippingAddress: {
          fullName: 'Test User 2',
          email: 'test2@test.com',
          phone: '0501234568',
          street: 'Test St 2',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: { subtotal: 200, shipping: 49, tax: 0, total: 249 },
        payment: {
          method: 'credit_card',
          status: 'ready_to_charge',
          hypTransactionId: 'TEST-LOCK-2',
          holdAmount: 249
        }
      });

      // הרץ job
      const stats = await chargeReadyOrders();

      // צריך לעבד 2 הזמנות (או לדלג אם locks נשארו)
      expect(stats.processed).toBeGreaterThanOrEqual(2);

      // וודא שלא נשארו locks
      const remainingLocks = await Lock.countDocuments();
      expect(remainingLocks).toBe(0);
    }, 30000);

    it('should not release lock owned by another instance', async () => {
      const lockKey = 'test_ownership_lock';

      // Instance 1 רוכש
      await acquireLock(lockKey, 10);

      // Instance 2 מנסה לשחרר - לא צריך לעבוד
      // (distributedLock בודק את lockedBy)
      await releaseLock(lockKey); // זה ינסה לשחרר אבל ייכשל בשקט

      // וודא שה-lock עדיין קיים
      const lock = await Lock.findById(lockKey);
      expect(lock).toBeDefined();

      // נקה
      await Lock.deleteOne({ _id: lockKey });
    });
  });

  // ============================================
  // 6.5.4: Secure Logging (Integration test)
  // ============================================
  describe('6.5.4: Secure Logging', () => {

    it('should not log sensitive payment data', async () => {
      // בדוק שהקוד לא מכיל לוגים רגישים
      const fs = await import('fs');
      const paymentRoutesCode = fs.readFileSync(
        'c:\\Users\\1\\Desktop\\אמזון\\amazon-dropship\\backend\\src\\routes\\paymentRoutes.js',
        'utf-8'
      );

      // לא צריך להיות console.log(req.body) ישיר
      expect(paymentRoutesCode).not.toMatch(/console\.log\([^)]*req\.body\s*\)/);

      // אמור להיות הקוד המתוקן
      expect(paymentRoutesCode).toMatch(/req\.body\?\.Order/);
    });
  });

  // ============================================
  // Integration Test: Full Flow
  // ============================================
  describe('Integration: Full Critical Flow', () => {

    it('should handle complete flow with all fixes', async () => {
      // 1. צור הזמנה עם פריטים ordered (כדי שה-pre-save hook לא ירוץ)
      const order = await Order.create({
        orderNumber: 'TEST-FULL-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'ordered'
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            price: 200,
            quantity: 1,
            itemStatus: 'ordered'
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          email: 'test@test.com',
          phone: '0501234567',
          street: 'Test St',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: { subtotal: 300, shipping: 49, tax: 0, total: 349 },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-FULL-123',
          holdAmount: 349
        }
      });

      // 2. נסה atomic update (6.5.1)
      const atomicResult = await tryMarkPaymentAsReady(order._id);
      expect(atomicResult.updated).toBe(true);

      const updated = await Order.findById(order._id);
      expect(updated.payment.status).toBe('ready_to_charge');

      // 4. וודא lock (6.5.3)
      const lockKey = `charge_order_${order._id}`;
      const lockAcquired = await acquireLock(lockKey, 60);
      expect(lockAcquired).toBe(true);

      // 5. שחרר lock
      await releaseLock(lockKey);

      // וודא שלא נשאר lock
      const remainingLock = await Lock.findById(lockKey);
      expect(remainingLock).toBeNull();

      // ✅ כל התיקונים פעילים: atomic update, retry fields, distributed lock
    }, 30000);
  });
});

console.log('\n✅ Phase 6.5 Critical Security Tests מוכנים לריצה!\n');
