/**
 * Automation Integrity Tests
 *
 * טסטים אלו מוודאים שהאוטומציות של המערכת עובדות תקין:
 * 1. Auto Status Update - עדכון אוטומטי של סטטוס ההזמנה
 * 2. Payment Status Auto-Detection - זיהוי אוטומטי של מוכנות לגביה
 * 3. Pre-save Hooks - וידוא שה-hooks רצים
 * 4. Transaction + Hooks Integration - וידוא שה-hooks רצים גם עם transactions
 * 5. Timeline Auto-Updates - עדכונים אוטומטיים ב-timeline
 * 6. Computed Fields - חישובים אוטומטיים
 *
 * ⚠️ אם אחד מהטסטים האלה נכשל - הלוגיקה האוטומטית נשברה!
 */

import mongoose from 'mongoose';
import Order from '../src/models/Order.js';

describe('🤖 Automation Integrity Tests', () => {

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/amazon-dropship-test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // נקה הזמנות בדיקה
    await Order.deleteMany({ orderNumber: /^TEST-AUTO-/ });
  });

  // ============================================
  // 1. Auto Status Update - עדכון אוטומטי של סטטוס
  // ============================================
  describe('1. Auto Status Update', () => {

    it('should auto-update status from pending to in_progress when first item is ordered', async () => {
      // צור הזמנה עם 2 פריטים pending
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-STATUS-1-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'pending'
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            price: 200,
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
        pricing: { subtotal: 300, shipping: 49, tax: 0, total: 349 },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-12345',
          holdAmount: 349
        }
      });

      // וודא שהסטטוס התחיל כ-pending
      expect(order.status).toBe('pending');

      // עדכן פריט אחד ל-ordered
      order.items[0].itemStatus = 'ordered_from_supplier';
      order.items[0].supplierOrder = {
        orderedAt: new Date(),
        supplierOrderNumber: '12345',
        actualCost: 100
      };
      await order.save();

      // וודא שהסטטוס השתנה ל-in_progress אוטומטית
      const updated = await Order.findById(order._id);
      expect(updated.status).toBe('in_progress');

      // וודא שיש רשומה ב-timeline
      const timelineEntry = updated.timeline.find(t => t.status === 'in_progress');
      expect(timelineEntry).toBeDefined();
      expect(timelineEntry.message).toContain('1 מתוך 2');
    });

    it('should auto-update status from in_progress to shipped when all items are in_transit', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-STATUS-2-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'ordered_from_supplier',
            supplierOrder: {
              orderedAt: new Date(),
              supplierOrderNumber: '12345',
              actualCost: 100
            }
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            price: 200,
            quantity: 1,
            itemStatus: 'ordered_from_supplier',
            supplierOrder: {
              orderedAt: new Date(),
              supplierOrderNumber: '12346',
              actualCost: 200
            }
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
          hypTransactionId: 'TEST-12345',
          holdAmount: 349
        }
      });

      // עדכן את כל הפריטים ל-in_transit
      order.items[0].itemStatus = 'in_transit';
      order.items[0].israelTracking = {
        trackingNumber: 'IL123',
        carrier: 'regular',
        shippedAt: new Date()
      };
      order.items[1].itemStatus = 'in_transit';
      order.items[1].israelTracking = {
        trackingNumber: 'IL124',
        carrier: 'regular',
        shippedAt: new Date()
      };
      await order.save();

      // וודא שהסטטוס השתנה ל-shipped אוטומטית
      const updated = await Order.findById(order._id);
      expect(updated.status).toBe('shipped');
    });

    it('should auto-update status to delivered when all items are delivered', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-STATUS-3-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'shipped_to_customer',
            supplierOrder: {
              orderedAt: new Date(),
              supplierOrderNumber: '12345',
              actualCost: 100
            },
            customerTracking: {
              trackingNumber: 'CUS123',
              carrier: 'israel_post',
              shippedAt: new Date()
            }
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

      // עדכן את הפריט ל-delivered
      order.items[0].itemStatus = 'delivered';
      order.items[0].deliveredAt = new Date();
      await order.save();

      // וודא שהסטטוס השתנה ל-delivered אוטומטית
      const updated = await Order.findById(order._id);
      expect(updated.status).toBe('delivered');
    });

    it('should auto-update status to cancelled when all items are cancelled', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-STATUS-4-' + Date.now(),
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

      // בטל את הפריט
      order.items[0].cancellation = {
        cancelled: true,
        cancelledAt: new Date(),
        reason: 'Out of stock'
      };
      await order.save();

      // וודא שהסטטוס השתנה ל-cancelled אוטומטית
      const updated = await Order.findById(order._id);
      expect(updated.status).toBe('cancelled');
    });
  });

  // ============================================
  // 2. Payment Status Auto-Detection
  // ============================================
  describe('2. Payment Status Auto-Detection', () => {

    it('should auto-detect ready_to_charge when all items are decided', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-PAYMENT-1-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'pending'
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            price: 200,
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
        pricing: { subtotal: 300, shipping: 49, tax: 0, total: 349 },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-12345',
          holdAmount: 349
        }
      });

      // עדכן את כל הפריטים ל-ordered
      order.items[0].itemStatus = 'ordered_from_supplier';
      order.items[0].supplierOrder = {
        orderedAt: new Date(),
        supplierOrderNumber: '12345',
        actualCost: 100
      };
      order.items[1].itemStatus = 'ordered_from_supplier';
      order.items[1].supplierOrder = {
        orderedAt: new Date(),
        supplierOrderNumber: '12346',
        actualCost: 200
      };
      await order.save();

      // וודא שה-payment.status השתנה ל-ready_to_charge אוטומטית
      const updated = await Order.findById(order._id);
      expect(updated.payment.status).toBe('ready_to_charge');

      // וודא שיש רשומה ב-timeline
      const timelineEntry = updated.timeline.find(t => t.status === 'ready_to_charge');
      expect(timelineEntry).toBeDefined();
    });

    it('should NOT auto-detect ready_to_charge if some items are still pending', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-PAYMENT-2-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'pending'
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            price: 200,
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
        pricing: { subtotal: 300, shipping: 49, tax: 0, total: 349 },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-12345',
          holdAmount: 349
        }
      });

      // עדכן רק פריט אחד ל-ordered (השני נשאר pending)
      order.items[0].itemStatus = 'ordered_from_supplier';
      order.items[0].supplierOrder = {
        orderedAt: new Date(),
        supplierOrderNumber: '12345',
        actualCost: 100
      };
      await order.save();

      // וודא שה-payment.status עדיין hold
      const updated = await Order.findById(order._id);
      expect(updated.payment.status).toBe('hold');
    });

    it('should auto-detect ready_to_charge when some items are ordered and some are cancelled', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-PAYMENT-3-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'pending'
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            price: 200,
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
        pricing: { subtotal: 300, shipping: 49, tax: 0, total: 349 },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-12345',
          holdAmount: 349
        }
      });

      // פריט 1 הוזמן, פריט 2 בוטל
      order.items[0].itemStatus = 'ordered_from_supplier';
      order.items[0].supplierOrder = {
        orderedAt: new Date(),
        supplierOrderNumber: '12345',
        actualCost: 100
      };
      order.items[1].cancellation = {
        cancelled: true,
        cancelledAt: new Date(),
        reason: 'Out of stock'
      };
      await order.save();

      // וודא שה-payment.status השתנה ל-ready_to_charge
      const updated = await Order.findById(order._id);
      expect(updated.payment.status).toBe('ready_to_charge');
    });
  });

  // ============================================
  // 3. Timeline Auto-Updates
  // ============================================
  describe('3. Timeline Auto-Updates', () => {

    it('should auto-add timeline entry when order is created', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-TIMELINE-1-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Item 1',
          price: 100,
          quantity: 1,
          itemStatus: 'pending'
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
          status: 'pending'
        }
      });

      // וודא שיש רשומה ב-timeline עבור pending
      expect(order.timeline.length).toBeGreaterThan(0);
      expect(order.timeline[0].status).toBe('pending');
      expect(order.timeline[0].message).toBe('ההזמנה התקבלה');
    });

    it('should auto-add timeline entries when status changes', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-TIMELINE-2-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Item 1',
          price: 100,
          quantity: 1,
          itemStatus: 'pending'
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

      const initialTimelineLength = order.timeline.length;

      // עדכן פריט ל-ordered
      order.items[0].itemStatus = 'ordered_from_supplier';
      order.items[0].supplierOrder = {
        orderedAt: new Date(),
        supplierOrderNumber: '12345',
        actualCost: 100
      };
      await order.save();

      // וודא שנוספו רשומות ב-timeline
      const updated = await Order.findById(order._id);
      expect(updated.timeline.length).toBeGreaterThan(initialTimelineLength);

      // וודא שיש רשומה עבור in_progress
      const inProgressEntry = updated.timeline.find(t => t.status === 'in_progress');
      expect(inProgressEntry).toBeDefined();

      // וודא שיש רשומה עבור ready_to_charge
      const readyEntry = updated.timeline.find(t => t.status === 'ready_to_charge');
      expect(readyEntry).toBeDefined();
    });
  });

  // ============================================
  // 4. Computed Fields
  // ============================================
  describe('4. Computed Fields', () => {

    it('should auto-compute completion percentage', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-COMPUTED-1-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'pending'
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            price: 200,
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
        pricing: { subtotal: 300, shipping: 49, tax: 0, total: 349 },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-12345',
          holdAmount: 349
        }
      });

      // וודא שה-completionPercentage התחיל ב-0
      expect(order.computed.completionPercentage).toBe(0);

      // עדכן פריט אחד ל-delivered
      order.items[0].itemStatus = 'delivered';
      order.items[0].deliveredAt = new Date();
      await order.save();

      // וודא שה-completionPercentage עודכן ל-50%
      const updated = await Order.findById(order._id);
      expect(updated.computed.completionPercentage).toBe(50);
    });

    it('should auto-compute hasActiveItems', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-COMPUTED-2-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Item 1',
          price: 100,
          quantity: 1,
          itemStatus: 'pending'
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

      // וודא שיש פריטים פעילים
      expect(order.computed.hasActiveItems).toBe(true);

      // בטל את הפריט
      order.items[0].cancellation = {
        cancelled: true,
        cancelledAt: new Date(),
        reason: 'Test'
      };
      await order.save();

      // וודא שאין יותר פריטים פעילים
      const updated = await Order.findById(order._id);
      expect(updated.computed.hasActiveItems).toBe(false);
    });

    it('should auto-compute allItemsDelivered', async () => {
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-COMPUTED-3-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'pending'
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            price: 200,
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
        pricing: { subtotal: 300, shipping: 49, tax: 0, total: 349 },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-12345',
          holdAmount: 349
        }
      });

      // וודא שלא כל הפריטים delivered
      expect(order.computed.allItemsDelivered).toBe(false);

      // עדכן את כל הפריטים ל-delivered
      order.items[0].itemStatus = 'delivered';
      order.items[0].deliveredAt = new Date();
      order.items[1].itemStatus = 'delivered';
      order.items[1].deliveredAt = new Date();
      await order.save();

      // וודא שכל הפריטים delivered
      const updated = await Order.findById(order._id);
      expect(updated.computed.allItemsDelivered).toBe(true);
    });
  });

  // ============================================
  // 5. Integration Test - Full Flow
  // ============================================
  describe('5. Full Automation Flow', () => {

    it('should handle complete order lifecycle with all automations', async () => {
      // 1. צור הזמנה חדשה
      const order = await Order.create({
        orderNumber: 'TEST-AUTO-FULL-' + Date.now(),
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            price: 100,
            quantity: 1,
            itemStatus: 'pending'
          },
          {
            product: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            price: 200,
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
        pricing: { subtotal: 300, shipping: 49, tax: 0, total: 349 },
        payment: {
          method: 'credit_card',
          status: 'hold',
          hypTransactionId: 'TEST-12345',
          holdAmount: 349
        }
      });

      // ✅ Point 1: הזמנה חדשה
      expect(order.status).toBe('pending');
      expect(order.payment.status).toBe('hold');
      expect(order.computed.completionPercentage).toBe(0);
      expect(order.timeline.length).toBeGreaterThan(0);

      // 2. הזמן פריט אחד מהספק
      order.items[0].itemStatus = 'ordered_from_supplier';
      order.items[0].supplierOrder = {
        orderedAt: new Date(),
        supplierOrderNumber: '12345',
        actualCost: 100
      };
      await order.save();

      let updated = await Order.findById(order._id);

      // ✅ Point 2: פריט אחד הוזמן
      expect(updated.status).toBe('in_progress');
      expect(updated.payment.status).toBe('hold'); // עדיין hold כי יש פריט pending
      expect(updated.computed.completionPercentage).toBeGreaterThan(0);

      // 3. הזמן את הפריט השני
      updated.items[1].itemStatus = 'ordered_from_supplier';
      updated.items[1].supplierOrder = {
        orderedAt: new Date(),
        supplierOrderNumber: '12346',
        actualCost: 200
      };
      await updated.save();

      updated = await Order.findById(order._id);

      // ✅ Point 3: כל הפריטים הוזמנו
      expect(updated.status).toBe('in_progress');
      expect(updated.payment.status).toBe('ready_to_charge'); // ✅ אוטומטית!

      // 4. הוסף tracking בינלאומי
      updated.items[0].itemStatus = 'in_transit';
      updated.items[0].israelTracking = {
        trackingNumber: 'IL123',
        carrier: 'regular',
        shippedAt: new Date()
      };
      updated.items[1].itemStatus = 'in_transit';
      updated.items[1].israelTracking = {
        trackingNumber: 'IL124',
        carrier: 'regular',
        shippedAt: new Date()
      };
      await updated.save();

      updated = await Order.findById(order._id);

      // ✅ Point 4: כל הפריטים בדרך
      expect(updated.status).toBe('shipped');

      // 5. הפריטים הגיעו לישראל
      updated.items[0].itemStatus = 'arrived_israel';
      updated.items[1].itemStatus = 'arrived_israel';
      await updated.save();

      updated = await Order.findById(order._id);

      // 6. שלח ללקוח
      updated.items[0].itemStatus = 'shipped_to_customer';
      updated.items[0].customerTracking = {
        trackingNumber: 'CUS123',
        carrier: 'israel_post',
        shippedAt: new Date()
      };
      updated.items[1].itemStatus = 'shipped_to_customer';
      updated.items[1].customerTracking = {
        trackingNumber: 'CUS124',
        carrier: 'israel_post',
        shippedAt: new Date()
      };
      await updated.save();

      updated = await Order.findById(order._id);

      // 7. הפריטים נמסרו
      updated.items[0].itemStatus = 'delivered';
      updated.items[0].deliveredAt = new Date();
      updated.items[1].itemStatus = 'delivered';
      updated.items[1].deliveredAt = new Date();
      await updated.save();

      updated = await Order.findById(order._id);

      // ✅ Point 5: הזמנה הושלמה
      expect(updated.status).toBe('delivered');
      expect(updated.computed.completionPercentage).toBe(100);
      expect(updated.computed.allItemsDelivered).toBe(true);

      // ✅ וודא שיש timeline מלא
      expect(updated.timeline.length).toBeGreaterThan(5);
    }, 30000);
  });
});

console.log('\n✅ Automation Integrity Tests - מגן על הלוגיקה האוטומטית של המערכת!\n');
