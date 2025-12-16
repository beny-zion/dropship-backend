/**
 * Shipping Calculator Tests
 *
 * בדיקות למחשבון המשלוח המפושט
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { calculateShipping, calculateShippingSync } from '../src/utils/shippingCalculator.js';
import SystemSettings from '../src/models/SystemSettings.js';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// טען משתני סביבה
dotenv.config({ path: join(__dirname, '../.env') });

describe('Shipping Calculator - New API', () => {
  let settings;

  beforeAll(async () => {
    // חיבור למסד נתונים
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    // קבל או צור הגדרות
    settings = await SystemSettings.getSettings();
  }, 15000); // 15 seconds timeout

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('calculateShipping()', () => {
    it('should calculate flat rate shipping for ILS', async () => {
      const items = [
        { price: 100, quantity: 1, status: 'pending' },
        { price: 50, quantity: 2, status: 'pending' }
      ];

      const result = await calculateShipping(items, settings, 'ILS');

      expect(result.shipping).toBe(49);
      expect(result.freeShipping).toBe(false);
      expect(result.breakdown.activeItems).toBe(2);
      expect(result.breakdown.subtotal).toBe(200);
    });

    it('should calculate flat rate shipping for USD', async () => {
      const items = [
        { price: 50, quantity: 1, status: 'pending' }
      ];

      const result = await calculateShipping(items, settings, 'USD');

      expect(result.shipping).toBe(15);
      expect(result.freeShipping).toBe(false);
      expect(result.breakdown.activeItems).toBe(1);
    });

    it('should return 0 shipping when all items are cancelled', async () => {
      const items = [
        { price: 100, quantity: 1, status: 'cancelled' },
        { price: 50, quantity: 2, itemStatus: 'cancelled' }
      ];

      const result = await calculateShipping(items, settings, 'ILS');

      expect(result.shipping).toBe(0);
      expect(result.freeShipping).toBe(false);
      expect(result.breakdown.activeItems).toBe(0);
    });

    it('should filter out cancelled items', async () => {
      const items = [
        { price: 100, quantity: 1, status: 'pending' },
        { price: 50, quantity: 2, status: 'cancelled' },
        { price: 30, quantity: 1, status: 'pending' }
      ];

      const result = await calculateShipping(items, settings, 'ILS');

      expect(result.breakdown.activeItems).toBe(2);
      expect(result.breakdown.subtotal).toBe(130); // 100 + 30
    });

    it('should handle free shipping if enabled and threshold met', async () => {
      // יצירת הגדרות עם משלוח חינם
      const customSettings = {
        shipping: {
          flatRate: { ils: 49, usd: 15 },
          freeShipping: {
            enabled: true,
            threshold: { ils: 200, usd: 50 }
          }
        }
      };

      const items = [
        { price: 150, quantity: 1, status: 'pending' },
        { price: 100, quantity: 1, status: 'pending' }
      ];

      const result = await calculateShipping(items, customSettings, 'ILS');

      expect(result.shipping).toBe(0);
      expect(result.freeShipping).toBe(true);
      expect(result.breakdown.subtotal).toBe(250);
    });

    it('should not apply free shipping if threshold not met', async () => {
      const customSettings = {
        shipping: {
          flatRate: { ils: 49, usd: 15 },
          freeShipping: {
            enabled: true,
            threshold: { ils: 500, usd: 100 }
          }
        }
      };

      const items = [
        { price: 100, quantity: 1, status: 'pending' }
      ];

      const result = await calculateShipping(items, customSettings, 'ILS');

      expect(result.shipping).toBe(49);
      expect(result.freeShipping).toBe(false);
    });

    it('should handle items with cancellation object', async () => {
      const items = [
        { price: 100, quantity: 1, status: 'pending' },
        {
          price: 50,
          quantity: 2,
          status: 'pending',
          cancellation: { cancelled: true, reason: 'test' }
        }
      ];

      const result = await calculateShipping(items, settings, 'ILS');

      expect(result.breakdown.activeItems).toBe(1);
      expect(result.breakdown.subtotal).toBe(100);
    });
  });

  describe('calculateShippingSync()', () => {
    it('should calculate flat rate for ILS synchronously', () => {
      const items = [
        { price: 100, quantity: 1, status: 'pending' }
      ];

      const result = calculateShippingSync(items, 'ILS');

      expect(result).toBe(49);
    });

    it('should calculate flat rate for USD synchronously', () => {
      const items = [
        { price: 100, quantity: 1, status: 'pending' }
      ];

      const result = calculateShippingSync(items, 'USD');

      expect(result).toBe(15);
    });

    it('should return 0 for cancelled items', () => {
      const items = [
        { price: 100, quantity: 1, status: 'cancelled' }
      ];

      const result = calculateShippingSync(items, 'ILS');

      expect(result).toBe(0);
    });

    it('should handle empty items array', () => {
      const result = calculateShippingSync([], 'ILS');
      expect(result).toBe(0);
    });
  });
});

console.log('✅ בדיקות shippingCalculator מוכנות לריצה');
