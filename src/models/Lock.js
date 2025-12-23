/**
 * Lock Model - Distributed Locking for Payment Jobs
 *
 * ✅ Phase 6.5.3: מונע double-execution של chargeReadyOrders
 *
 * הבעיה:
 * כאשר יש 2+ instances של השרת (production scaling):
 * - Instance A: מוצא order ABC, מתחיל לגבות
 * - Instance B: מוצא order ABC, מתחיל לגבות
 * - תוצאה: חיוב כפול! 💥
 *
 * הפתרון:
 * Distributed lock עם MongoDB TTL index
 * - רק instance אחד יכול לרכוש lock
 * - Lock פג תוקף אוטומטית (למקרה של crash)
 */

import mongoose from 'mongoose';

const lockSchema = new mongoose.Schema({
  // Lock key (e.g., "charge_order_6579abc123...")
  _id: {
    type: String,
    required: true
  },

  // מזהה instance/process שמחזיק ב-lock
  lockedBy: {
    type: String,
    required: true
  },

  // מתי ה-lock נרכש
  lockedAt: {
    type: Date,
    default: Date.now
  },

  // מתי ה-lock יפוג (TTL)
  expiresAt: {
    type: Date,
    required: true,
    index: true
  }
});

// ✅ TTL Index - MongoDB ימחק locks שפג תוקפם אוטומטית
lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Lock = mongoose.model('Lock', lockSchema);

export default Lock;
