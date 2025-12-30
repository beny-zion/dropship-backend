/**
 * Phase 7.3: Distributed Lock Tests
 *
 * מטרה: למנוע חיובים כפולים במערכת multi-server
 *
 * Tests:
 * - 7.3.1: Concurrent Job Execution (2 servers במקביל)
 * - 7.3.2: Lock TTL Expiry (ניקוי אוטומטי)
 * - 7.3.3: Lock Release on Error (שחרור אחרי שגיאה)
 * - 7.3.4: Lock Acquisition & Release (פונקציות בסיס)
 * - 7.3.5: Cannot Release Others' Lock (אבטחה)
 */

import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import Lock from '../src/models/Lock.js';
import { chargeReadyOrders } from '../src/jobs/chargeReadyOrders.js';
import { acquireLock, releaseLock, extendLock, checkLock, INSTANCE_ID } from '../src/utils/distributedLock.js';
import * as hypPayClient from '../src/utils/hypPayClient.js';

describe('Phase 7.3: Distributed Lock', () => {
  beforeEach(async () => {
    // Clean locks and test orders
    await Lock.deleteMany({});
    await Order.deleteMany({ orderNumber: /^LOCK-TEST-/ });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Helper: Create order in ready_to_charge status
   */
  const createReadyOrder = async (orderNumber) => {
    return await Order.create({
      orderNumber,
      customer: {
        name: 'Test Customer',
        email: 'lock-customer@test.com',
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
        status: 'ready_to_charge',
        method: 'credit_card',
        hypTransactionId: `MOCK-${orderNumber}`,
        holdAmount: 500
      },
      timeline: [
        {
          status: 'ready_to_charge',
          message: 'Ready for payment',
          timestamp: new Date()
        }
      ]
    });
  };

  /**
   * Test 7.3.1: Concurrent Job Execution
   *
   * תרחיש:
   * 1. צור 3 הזמנות ב-ready_to_charge
   * 2. הרץ 2 instances של chargeReadyOrders() במקביל
   * 3. בדוק שכל הזמנה עובדה רק פעם אחת
   *
   * תוצאה צפויה:
   * - כל 3 ההזמנות חוייבו
   * - אין חיובים כפולים
   * - סטטיסטיקות: processed + skipped = total orders
   */
  describe('7.3.1 Concurrent Job Execution', () => {
    it('should prevent double-charging with locks', async () => {
      // Setup: 3 ready orders
      const orders = await Promise.all([
        createReadyOrder('LOCK-TEST-001'),
        createReadyOrder('LOCK-TEST-002'),
        createReadyOrder('LOCK-TEST-003')
      ]);

      // Mock successful capture
      let captureCallCount = 0;
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockImplementation(async () => {
          captureCallCount++;
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 50));
          return {
            success: true,
            CCode: '0',
            Amount: 500,
            Id: `CAPTURE-${captureCallCount}`
          };
        });

      // Execute: 2 instances running in parallel
      const [stats1, stats2] = await Promise.all([
        chargeReadyOrders(),
        chargeReadyOrders()
      ]);

      // ✅ Total processed should be 3
      const totalProcessed = stats1.success + stats2.success;
      expect(totalProcessed).toBe(3);

      // ✅ Some orders should have been skipped (locked)
      const totalSkipped = stats1.skipped + stats2.skipped;
      expect(totalSkipped).toBeGreaterThan(0);

      // ✅ captureTransaction called exactly 3 times (not 6!)
      expect(captureCallCount).toBe(3);

      // ✅ All orders should be captured
      for (const order of orders) {
        const updated = await Order.findById(order._id);
        expect(updated.payment.status).toBe('captured');

        // Count capture events in timeline
        const captureEvents = updated.timeline.filter(
          e => e.status === 'captured' || e.type === 'payment_captured'
        );
        expect(captureEvents).toHaveLength(1);
      }

      // ✅ All locks should be released
      const remainingLocks = await Lock.find({});
      expect(remainingLocks).toHaveLength(0);
    });

    it('should distribute work between instances', async () => {
      // Setup: 5 orders
      await Promise.all([
        createReadyOrder('LOCK-TEST-004'),
        createReadyOrder('LOCK-TEST-005'),
        createReadyOrder('LOCK-TEST-006'),
        createReadyOrder('LOCK-TEST-007'),
        createReadyOrder('LOCK-TEST-008')
      ]);

      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockResolvedValue({ success: true, CCode: '0', Amount: 500 });

      // Run 2 instances
      const [stats1, stats2] = await Promise.all([
        chargeReadyOrders(),
        chargeReadyOrders()
      ]);

      // ✅ Work should be distributed
      expect(stats1.success).toBeGreaterThan(0);
      expect(stats2.success).toBeGreaterThan(0);

      // ✅ Total = 5
      expect(stats1.success + stats2.success).toBe(5);

      // ✅ Both instances should have skipped some
      expect(stats1.skipped + stats2.skipped).toBeGreaterThan(0);
    });
  });

  /**
   * Test 7.3.2: Lock TTL Expiry
   *
   * תרחיש:
   * 1. צור lock ידנית עם TTL של 2 שניות
   * 2. המתן 3 שניות
   * 3. בדוק שה-lock מסומן לניקוי (expiresAt < now)
   *
   * תוצאה צפויה:
   * - expiresAt בעבר
   * - MongoDB TTL index יוסר אותו אחרי ~60 שניות
   */
  describe('7.3.2 Lock TTL Expiry', () => {
    it('should mark locks for deletion after TTL', async () => {
      // Create lock with 1-second TTL
      const lock = await Lock.create({
        _id: 'test-lock-ttl-001',
        lockedBy: 'test-instance-1',
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000) // 1 second from now
      });

      // Verify lock exists
      const initialLock = await Lock.findById('test-lock-ttl-001');
      expect(initialLock).toBeDefined();
      expect(initialLock.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check lock again
      const expiredLock = await Lock.findById('test-lock-ttl-001');

      if (expiredLock) {
        // ✅ expiresAt should be in the past
        expect(expiredLock.expiresAt.getTime()).toBeLessThan(Date.now());

        // MongoDB TTL index will clean it up within ~60 seconds
        // We can't test the actual deletion here (would take too long)
      } else {
        // Lock already deleted - also acceptable
        expect(expiredLock).toBeNull();
      }
    });

    it('should have TTL index configured', async () => {
      // Check that Lock model has TTL index
      const indexes = await Lock.collection.getIndexes();

      // ✅ Should have index on expiresAt with expireAfterSeconds: 0
      const ttlIndex = Object.values(indexes).find(index =>
        index.some(field => field[0] === 'expiresAt') &&
        index.expireAfterSeconds === 0
      );

      expect(ttlIndex).toBeDefined();
    });
  });

  /**
   * Test 7.3.3: Lock Release on Error
   *
   * תרחיש:
   * 1. צור הזמנה ב-ready_to_charge
   * 2. Mock chargeOrder() לזרוק שגיאה
   * 3. הרץ chargeReadyOrders()
   * 4. בדוק שה-lock שוחרר
   *
   * תוצאה צפויה:
   * - Lock לא קיים אחרי השגיאה (finally block)
   * - הזמנה הבאה יכולה לעבד את ההזמנה
   */
  describe('7.3.3 Lock Release on Error', () => {
    it('should release lock even if charge fails', async () => {
      const order = await createReadyOrder('LOCK-TEST-009');

      // Mock error during capture
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockRejectedValueOnce(new Error('Capture failed'));

      // Execute
      await chargeReadyOrders();

      // ✅ Lock should be released despite error
      const remainingLocks = await Lock.find({});
      expect(remainingLocks).toHaveLength(0);

      // Verify we can process the order again
      jest.spyOn(hypPayClient, 'captureTransaction')
        .mockResolvedValueOnce({ success: true, CCode: '0', Amount: 500 });

      // Set nextRetryAt to now (if it entered retry_pending)
      await Order.findByIdAndUpdate(order._id, {
        'payment.nextRetryAt': new Date()
      });

      const stats = await chargeReadyOrders();

      // ✅ Should be able to acquire lock again
      expect(stats.success + stats.failed + stats.cancelled).toBeGreaterThan(0);
    });
  });

  /**
   * Test 7.3.4: Lock Acquisition & Release
   *
   * בדיקת פונקציות בסיס של distributed lock
   */
  describe('7.3.4 Lock Acquisition & Release', () => {
    it('acquireLock should create lock in DB', async () => {
      const lockKey = 'test-lock-acquire-001';

      // Acquire lock
      const acquired = await acquireLock(lockKey, 60);

      // ✅ Should return true
      expect(acquired).toBe(true);

      // ✅ Lock should exist in DB
      const lock = await Lock.findById(lockKey);
      expect(lock).toBeDefined();
      expect(lock.lockedBy).toBe(INSTANCE_ID);

      // ✅ expiresAt should be ~60 seconds from now
      const secondsUntilExpiry = (lock.expiresAt - Date.now()) / 1000;
      expect(secondsUntilExpiry).toBeGreaterThan(55);
      expect(secondsUntilExpiry).toBeLessThan(65);
    });

    it('acquireLock should fail if lock exists', async () => {
      const lockKey = 'test-lock-acquire-002';

      // First acquisition should succeed
      const first = await acquireLock(lockKey, 60);
      expect(first).toBe(true);

      // Second acquisition should fail
      const second = await acquireLock(lockKey, 60);
      expect(second).toBe(false);
    });

    it('releaseLock should delete lock from DB', async () => {
      const lockKey = 'test-lock-release-001';

      // Acquire
      await acquireLock(lockKey, 60);
      expect(await Lock.findById(lockKey)).toBeDefined();

      // Release
      await releaseLock(lockKey);

      // ✅ Lock should be gone
      expect(await Lock.findById(lockKey)).toBeNull();
    });

    it('releaseLock should be idempotent', async () => {
      const lockKey = 'test-lock-release-002';

      await acquireLock(lockKey, 60);

      // Release twice - should not throw
      await releaseLock(lockKey);
      await releaseLock(lockKey); // Should be safe
    });

    it('extendLock should update expiresAt', async () => {
      const lockKey = 'test-lock-extend-001';

      await acquireLock(lockKey, 10); // 10 seconds

      const initialLock = await Lock.findById(lockKey);
      const initialExpiry = initialLock.expiresAt.getTime();

      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Extend by 30 seconds
      await extendLock(lockKey, 30);

      const extendedLock = await Lock.findById(lockKey);
      const newExpiry = extendedLock.expiresAt.getTime();

      // ✅ New expiry should be later
      expect(newExpiry).toBeGreaterThan(initialExpiry);

      // ✅ Should be ~30 seconds from now
      const secondsUntilExpiry = (newExpiry - Date.now()) / 1000;
      expect(secondsUntilExpiry).toBeGreaterThan(25);
      expect(secondsUntilExpiry).toBeLessThan(35);
    });

    it('checkLock should return lock if exists', async () => {
      const lockKey = 'test-lock-check-001';

      // No lock yet
      const noLock = await checkLock(lockKey);
      expect(noLock).toBeNull();

      // Acquire lock
      await acquireLock(lockKey, 60);

      // Check lock
      const existingLock = await checkLock(lockKey);
      expect(existingLock).toBeDefined();
      expect(existingLock._id).toBe(lockKey);
      expect(existingLock.lockedBy).toBe(INSTANCE_ID);
    });
  });

  /**
   * Test 7.3.5: Cannot Release Others' Lock
   *
   * בדיקת אבטחה: instance אחד לא יכול לשחרר lock של instance אחר
   */
  describe('7.3.5 Cannot Release Others Lock', () => {
    it('should only release own locks', async () => {
      const lockKey = 'test-lock-security-001';

      // Create lock owned by another instance
      await Lock.create({
        _id: lockKey,
        lockedBy: 'other-instance-123',
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000)
      });

      // Try to release it
      await releaseLock(lockKey);

      // ✅ Lock should still exist (we can't release others' locks)
      const lock = await Lock.findById(lockKey);
      expect(lock).toBeDefined();
      expect(lock.lockedBy).toBe('other-instance-123');
    });

    it('should only extend own locks', async () => {
      const lockKey = 'test-lock-security-002';

      // Create lock owned by another instance
      const otherLock = await Lock.create({
        _id: lockKey,
        lockedBy: 'other-instance-456',
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000)
      });

      const originalExpiry = otherLock.expiresAt.getTime();

      // Try to extend it
      await extendLock(lockKey, 120);

      // ✅ expiresAt should NOT change (we can't extend others' locks)
      const unchangedLock = await Lock.findById(lockKey);
      expect(unchangedLock.expiresAt.getTime()).toBe(originalExpiry);
      expect(unchangedLock.lockedBy).toBe('other-instance-456');
    });
  });

  /**
   * Test 7.3.6: Expired Lock Can Be Re-Acquired
   *
   * וודא שlock שפג תוקפו יכול להירכש מחדש
   */
  describe('7.3.6 Expired Lock Can Be Re-Acquired', () => {
    it('should allow acquiring expired locks', async () => {
      const lockKey = 'test-lock-expired-001';

      // Create expired lock
      await Lock.create({
        _id: lockKey,
        lockedBy: 'old-instance',
        lockedAt: new Date(Date.now() - 120000), // 2 minutes ago
        expiresAt: new Date(Date.now() - 60000)  // Expired 1 minute ago
      });

      // Try to acquire
      // Note: The current implementation uses findOneAndUpdate with $or
      // to check if lock is expired
      const acquired = await acquireLock(lockKey, 60);

      // ✅ Should succeed (lock is expired)
      expect(acquired).toBe(true);

      // ✅ Lock should be owned by current instance
      const lock = await Lock.findById(lockKey);
      expect(lock.lockedBy).toBe(INSTANCE_ID);
    });
  });
});
