/**
 * Auto Charging Tests - Phase 3
 *
 * בדיקות ללוגיקת הגביה האוטומטית:
 * 1. Pre-save hook מזהה מוכנות לגביה
 * 2. chargeReadyOrders מבצע גביה
 * 3. Payment Controller
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import { chargeReadyOrders } from '../src/jobs/chargeReadyOrders.js';
import dotenv from 'dotenv';

dotenv.config();

describe('Phase 3: Auto Charging Logic', () => {
  beforeAll(async () => {
    // חיבור ל-DB
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  describe('Pre-Save Hook: Payment Readiness Detection', () => {
    let testOrder;

    beforeEach(async () => {
      // נקה הזמנות בדיקה קודמות
      await Order.deleteMany({ orderNumber: /^TEST-AUTO-/ });

      // צור הזמנה חדשה
      testOrder = new Order({
        orderNumber: 'TEST-AUTO-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Test Product 1',
            price: 100,
            quantity: 1,
            itemStatus: 'pending'
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Test Product 2',
            price: 50,
            quantity: 1,
            itemStatus: 'pending'
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          email: 'test@example.com',
          phone: '0501234567',
          street: 'Test St 1',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: {
          subtotal: 150,
          tax: 0,
          shipping: 49,
          total: 199
        },
        payment: {
          method: 'credit_card',
          status: 'hold', // מסגרת נתפסה
          hypTransactionId: 'TEST-TRANS-' + Date.now(),
          holdAmount: 199
        }
      });

      await testOrder.save();
    });

    it('should NOT mark as ready_to_charge when items are still pending', async () => {
      // כל הפריטים pending - לא אמור לעבור ל-ready_to_charge
      expect(testOrder.payment.status).toBe('hold');
    });

    it('should mark as ready_to_charge when all items are ordered', async () => {
      // סמן את כל הפריטים כ-ordered
      testOrder.items[0].itemStatus = 'ordered';
      testOrder.items[1].itemStatus = 'ordered';

      await testOrder.save();

      // טען מחדש מה-DB
      const updatedOrder = await Order.findById(testOrder._id);

      expect(updatedOrder.payment.status).toBe('ready_to_charge');
      expect(updatedOrder.timeline).toContainEqual(
        expect.objectContaining({
          status: 'ready_to_charge'
        })
      );
    });

    it('should mark as ready_to_charge when all items are cancelled', async () => {
      // בטל את כל הפריטים
      testOrder.items[0].cancellation = {
        cancelled: true,
        reason: 'Test cancellation',
        cancelledAt: new Date()
      };
      testOrder.items[1].cancellation = {
        cancelled: true,
        reason: 'Test cancellation',
        cancelledAt: new Date()
      };

      await testOrder.save();

      const updatedOrder = await Order.findById(testOrder._id);

      expect(updatedOrder.payment.status).toBe('ready_to_charge');
    });

    it('should mark as ready_to_charge when mix of ordered and cancelled', async () => {
      // פריט אחד הוזמן, השני בוטל
      testOrder.items[0].itemStatus = 'ordered';
      testOrder.items[1].cancellation = {
        cancelled: true,
        reason: 'Test cancellation',
        cancelledAt: new Date()
      };

      await testOrder.save();

      const updatedOrder = await Order.findById(testOrder._id);

      expect(updatedOrder.payment.status).toBe('ready_to_charge');
    });

    it('should NOT mark as ready_to_charge if even one item is pending', async () => {
      // פריט אחד הוזמן, השני עדיין pending
      testOrder.items[0].itemStatus = 'ordered';
      testOrder.items[1].itemStatus = 'pending'; // עדיין ממתין!

      await testOrder.save();

      const updatedOrder = await Order.findById(testOrder._id);

      expect(updatedOrder.payment.status).toBe('hold'); // עדיין hold
    });

    it('should NOT change status if already charged', async () => {
      // שנה לסטטוס charged
      testOrder.payment.status = 'charged';
      await testOrder.save();

      // עכשיו נסה לשנות פריט
      testOrder.items[0].itemStatus = 'ordered';
      await testOrder.save();

      const updatedOrder = await Order.findById(testOrder._id);

      expect(updatedOrder.payment.status).toBe('charged'); // לא השתנה
    });
  });

  describe('chargeReadyOrders Job', () => {
    beforeEach(async () => {
      // נקה הזמנות בדיקה
      await Order.deleteMany({ orderNumber: /^TEST-JOB-/ });
    });

    it('should return 0 processed when no orders are ready', async () => {
      const stats = await chargeReadyOrders();

      expect(stats.processed).toBe(0);
    });

    it('should find orders with ready_to_charge status', async () => {
      // צור הזמנה מוכנה לגביה
      const order = new Order({
        orderNumber: 'TEST-JOB-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Test Product',
            price: 100,
            quantity: 1,
            itemStatus: 'ordered'
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          email: 'test@example.com',
          phone: '0501234567',
          street: 'Test St 1',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: {
          subtotal: 100,
          tax: 0,
          shipping: 49,
          total: 149
        },
        payment: {
          method: 'credit_card',
          status: 'ready_to_charge',
          hypTransactionId: 'TEST-TRANS-' + Date.now(),
          holdAmount: 149
        }
      });

      await order.save();

      // הרץ Job (ללא בדיקה בפועל - צריך mock ל-Hyp Pay)
      const stats = await chargeReadyOrders();

      expect(stats.processed).toBeGreaterThan(0);
    });
  });

  describe('Payment History Tracking', () => {
    it('should maintain payment history', async () => {
      const order = new Order({
        orderNumber: 'TEST-HISTORY-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Test Product',
            price: 100,
            quantity: 1,
            itemStatus: 'pending'
          }
        ],
        shippingAddress: {
          fullName: 'Test User',
          email: 'test@example.com',
          phone: '0501234567',
          street: 'Test St 1',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        pricing: {
          subtotal: 100,
          tax: 0,
          shipping: 49,
          total: 149
        },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-' + Date.now(),
          holdAmount: 149,
          paymentHistory: [
            {
              action: 'hold',
              amount: 149,
              transactionId: 'TEST-' + Date.now(),
              success: true,
              timestamp: new Date()
            }
          ]
        }
      });

      await order.save();

      expect(order.payment.paymentHistory).toHaveLength(1);
      expect(order.payment.paymentHistory[0].action).toBe('hold');
      expect(order.payment.paymentHistory[0].success).toBe(true);
    });
  });
});

console.log('✅ בדיקות Phase 3: Auto Charging Logic מוכנות לריצה');
