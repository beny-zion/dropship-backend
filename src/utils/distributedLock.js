/**
 * Distributed Lock Utility
 *
 * ✅ Phase 6.5.3: מניעת double-execution של jobs
 *
 * שימוש:
 * ```javascript
 * const lockKey = `charge_order_${orderId}`;
 * const acquired = await acquireLock(lockKey, 60);
 *
 * if (!acquired) {
 *   console.log('Another instance is processing this order');
 *   return;
 * }
 *
 * try {
 *   // do work...
 * } finally {
 *   await releaseLock(lockKey);
 * }
 * ```
 */

import Lock from '../models/Lock.js';

// Unique ID לכל instance של השרת
// Production: הגדר INSTANCE_ID ב-.env (e.g., "server-1", "server-2")
// Development: PID + timestamp
const INSTANCE_ID = process.env.INSTANCE_ID || `${process.pid}-${Date.now()}`;

console.log(`[DistributedLock] Instance ID: ${INSTANCE_ID}`);

/**
 * ניסיון לרכוש lock
 *
 * @param {string} lockKey - מפתח ייחודי (e.g., "charge_order_123")
 * @param {number} ttlSeconds - זמן תפוגה בשניות (default: 60)
 * @returns {Promise<boolean>} true אם הצלחנו לרכוש, false אם מישהו אחר מחזיק
 */
export async function acquireLock(lockKey, ttlSeconds = 60) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  try {
    // ניסיון לייצר lock חדש
    // אם כבר קיים - תזרוק Duplicate Key error
    const lock = new Lock({
      _id: lockKey,
      lockedBy: INSTANCE_ID,
      lockedAt: new Date(),
      expiresAt
    });

    await lock.save();

    console.log(`[DistributedLock] ✅ Acquired lock: ${lockKey} (expires in ${ttlSeconds}s)`);
    return true;

  } catch (error) {
    // Duplicate key error (code 11000) = lock כבר קיים
    if (error.code === 11000) {
      console.log(`[DistributedLock] ❌ Lock already held: ${lockKey}`);
      return false;
    }

    // אם זה לא duplicate key - זו שגיאה אמיתית
    console.error(`[DistributedLock] Error acquiring lock ${lockKey}:`, error.message);
    throw error;
  }
}

/**
 * שחרור lock
 *
 * @param {string} lockKey - מפתח ה-lock
 * @returns {Promise<void>}
 */
export async function releaseLock(lockKey) {
  try {
    const result = await Lock.deleteOne({
      _id: lockKey,
      lockedBy: INSTANCE_ID // רק אנחנו יכולים לשחרר את ה-lock שלנו
    });

    if (result.deletedCount > 0) {
      console.log(`[DistributedLock] 🔓 Released lock: ${lockKey}`);
    } else {
      console.log(`[DistributedLock] ⚠️  Lock not found or not owned: ${lockKey}`);
    }
  } catch (error) {
    console.error(`[DistributedLock] Error releasing lock ${lockKey}:`, error.message);
    // לא זורקים שגיאה - release הוא best-effort
  }
}

/**
 * הארכת lock (אם התהליך לוקח זמן)
 *
 * @param {string} lockKey - מפתח ה-lock
 * @param {number} additionalSeconds - כמה שניות להוסיף
 * @returns {Promise<boolean>} true אם הצליח להאריך
 */
export async function extendLock(lockKey, additionalSeconds = 30) {
  try {
    const result = await Lock.updateOne(
      {
        _id: lockKey,
        lockedBy: INSTANCE_ID
      },
      {
        $set: {
          expiresAt: new Date(Date.now() + additionalSeconds * 1000)
        }
      }
    );

    if (result.matchedCount > 0) {
      console.log(`[DistributedLock] ⏰ Extended lock: ${lockKey} (+${additionalSeconds}s)`);
      return true;
    } else {
      console.log(`[DistributedLock] ⚠️  Cannot extend - lock not found or not owned: ${lockKey}`);
      return false;
    }
  } catch (error) {
    console.error(`[DistributedLock] Error extending lock ${lockKey}:`, error.message);
    return false;
  }
}

/**
 * בדיקה אם lock קיים
 *
 * @param {string} lockKey - מפתח ה-lock
 * @returns {Promise<Object|null>} פרטי ה-lock או null
 */
export async function checkLock(lockKey) {
  try {
    const lock = await Lock.findById(lockKey);
    return lock;
  } catch (error) {
    console.error(`[DistributedLock] Error checking lock ${lockKey}:`, error.message);
    return null;
  }
}

export { INSTANCE_ID };
