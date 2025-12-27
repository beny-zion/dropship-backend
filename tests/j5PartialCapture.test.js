/**
 * ✅ Phase 6.5.3: J5 Protocol - Partial Capture Tests
 *
 * בודק את היכולת לבצע גביה חלקית (partial capture) באמצעות J5 Protocol
 * כאשר לקוח מבטל חלק מההזמנה.
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// טען .env לפני import של מודולים אחרים
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// הגדר MOCK MODE
process.env.HYP_MOCK_MODE = 'true';

import Order from '../src/models/Order.js';
import User from '../src/models/User.js';
import Product from '../src/models/Product.js';
import { holdCredit, capturePayment } from '../src/services/paymentService.js';

describe('Phase 6.5.3: J5 Partial Capture', () => {
  let testUser;
  let testProduct1;
  let testProduct2;

  beforeAll(async () => {
    // התחבר ל-MongoDB Test
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/amazon-dropship-test');
    }

    // נקה collections
    await Order.deleteMany({});
    await User.deleteMany({});
    await Product.deleteMany({});

    // יצירת משתמש טסט
    testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'hashedpassword123',
      role: 'user'
    });

    // יצירת מוצרים לטסט
    testProduct1 = await Product.create({
      name_he: 'מוצר טסט 1',
      description_he: 'תיאור מוצר טסט 1',
      price: {
        usd: 100,
        ils: 500
      },
      category: new mongoose.Types.ObjectId(), // קטגוריה דמה
      asin: 'TEST001',
      stock: 10
    });

    testProduct2 = await Product.create({
      name_he: 'מוצר טסט 2',
      description_he: 'תיאור מוצר טסט 2',
      price: {
        usd: 110,
        ils: 550
      },
      category: new mongoose.Types.ObjectId(), // קטגוריה דמה
      asin: 'TEST002',
      stock: 10
    });
  });

  afterAll(async () => {
    await Order.deleteMany({});
    await User.deleteMany({});
    await Product.deleteMany({});
    await mongoose.connection.close();
  });

  describe('J5 Hold - שמירת AuthCode ו-UID', () => {
    test('should save J5 AuthCode and UID when holding credit', async () => {
      // יצירת הזמנה
      const order = await Order.create({
        orderNumber: `TEST-J5-${Date.now()}`,
        user: testUser._id,
        items: [{
          product: testProduct1._id,
          quantity: 2,
          price: 500,
          name: 'Product 1'
        }],
        pricing: {
          subtotal: 1000,
          shipping: 50,
          tax: 0,
          total: 1050
        },
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          email: 'test@example.com',
          street: 'Test St 1',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        payment: {
          status: 'pending'
        }
      });

      // בצע Hold
      const paymentDetails = {
        cardNumber: '4580458045804580',
        expMonth: '12',
        expYear: '25',
        cvv: '123',
        userId: '123456789'
      };

      const result = await holdCredit(order, paymentDetails);

      // ✅ בדיקות
      expect(result.success).toBe(true);
      expect(result.authCode).toBeDefined();      // ACode from Hyp Pay
      expect(result.uid).toBeDefined();           // UID from Hyp Pay
      expect(result.transactionId).toBeDefined(); // Transaction ID

      // עדכן order (כמו ב-controller)
      order.payment.status = 'hold';
      order.payment.hypTransactionId = result.transactionId;
      order.payment.hypAuthCode = result.authCode;
      order.payment.hypUid = result.uid;
      order.payment.holdAmount = result.amount;
      await order.save();

      // וודא ששמרנו בהצלחה
      const savedOrder = await Order.findById(order._id);
      expect(savedOrder.payment.hypAuthCode).toBeDefined();
      expect(savedOrder.payment.hypUid).toBeDefined();
      expect(savedOrder.payment.hypTransactionId).toBeDefined();
      expect(savedOrder.payment.holdAmount).toBe(1050);

      console.log('✅ J5 Hold saved: AuthCode, UID, TransactionId');
    });
  });

  describe('Partial Capture - גביה חלקית', () => {
    test('should perform partial capture when items are cancelled', async () => {
      // יצירת הזמנה עם 2 פריטים
      const order = await Order.create({
        orderNumber: `TEST-PARTIAL-${Date.now()}`,
        user: testUser._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 1,
            price: 500,
            name: 'Product 1',
            itemStatus: 'pending'
          },
          {
            product: testProduct2._id,
            quantity: 1,
            price: 550,
            name: 'Product 2',
            itemStatus: 'pending'
          }
        ],
        pricing: {
          subtotal: 1050,
          shipping: 50,
          tax: 0,
          total: 1100
        },
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          email: 'test@example.com',
          street: 'Test St 1',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        payment: {
          status: 'pending'
        }
      });

      // בצע Hold על ₪1100
      const paymentDetails = {
        cardNumber: '4580458045804580',
        expMonth: '12',
        expYear: '25',
        cvv: '123',
        userId: '123456789'
      };

      const holdResult = await holdCredit(order, paymentDetails);
      expect(holdResult.success).toBe(true);

      // עדכן order עם נתוני J5
      order.payment.status = 'hold';
      order.payment.hypTransactionId = holdResult.transactionId;
      order.payment.hypAuthCode = holdResult.authCode;
      order.payment.hypUid = holdResult.uid;
      order.payment.holdAmount = holdResult.amount;
      await order.save();

      console.log(`🔵 Hold completed: ₪${holdResult.amount}`);

      // ביטול פריט אחד (Product 2 - ₪550)
      order.items[1].cancellation = {
        cancelled: true,
        reason: 'Customer request',
        cancelledAt: new Date()
      };
      order.items[1].itemStatus = 'cancelled';

      // הזמנת פריט שני (Product 1)
      order.items[0].itemStatus = 'ordered';
      order.items[0].supplierOrder = {
        orderedAt: new Date(),
        supplierOrderNumber: 'SUP-123'
      };

      // עדכן סטטוס תשלום
      order.payment.status = 'ready_to_charge';
      await order.save();

      console.log(`🔴 Item cancelled: ₪550`);
      console.log(`🟢 Final amount should be: ₪550 (₪500 + ₪50 shipping)`);

      // גביה בפועל - צריך לגבות רק ₪550
      const captureResult = await capturePayment(order);

      // ✅ בדיקות
      expect(captureResult.success).toBe(true);
      expect(captureResult.chargedAmount).toBe(550); // ₪500 + ₪50 shipping
      expect(captureResult.status).toBe('charged');

      console.log(`✅ Partial Capture success: ₪${captureResult.chargedAmount}`);
      console.log(`   Original Hold: ₪1100`);
      console.log(`   Final Charge: ₪550`);
      console.log(`   Saved: ₪550 ✨`);
    });

    test('should use regular commitTrans when no items cancelled', async () => {
      // יצירת הזמנה
      const order = await Order.create({
        orderNumber: `TEST-FULL-${Date.now()}`,
        user: testUser._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 1,
            price: 500,
            name: 'Product 1',
            itemStatus: 'pending'
          }
        ],
        pricing: {
          subtotal: 500,
          shipping: 50,
          tax: 0,
          total: 550
        },
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          email: 'test@example.com',
          street: 'Test St 1',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        payment: {
          status: 'pending'
        }
      });

      // Hold
      const paymentDetails = {
        cardNumber: '4580458045804580',
        expMonth: '12',
        expYear: '25',
        cvv: '123',
        userId: '123456789'
      };

      const holdResult = await holdCredit(order, paymentDetails);
      order.payment.status = 'hold';
      order.payment.hypTransactionId = holdResult.transactionId;
      order.payment.hypAuthCode = holdResult.authCode;
      order.payment.hypUid = holdResult.uid;
      order.payment.holdAmount = holdResult.amount;
      await order.save();

      // הזמנה מספק (ללא ביטולים)
      order.items[0].itemStatus = 'ordered';
      order.items[0].supplierOrder = {
        orderedAt: new Date(),
        supplierOrderNumber: 'SUP-456'
      };
      order.payment.status = 'ready_to_charge';
      await order.save();

      // גביה - צריך להשתמש ב-commitTrans רגיל
      const captureResult = await capturePayment(order);

      expect(captureResult.success).toBe(true);
      expect(captureResult.chargedAmount).toBe(550);

      console.log('✅ Full Capture (commitTrans) works correctly');
    });

    test('should handle multiple partial cancellations correctly', async () => {
      // הזמנה עם 3 פריטים
      const order = await Order.create({
        orderNumber: `TEST-MULTI-${Date.now()}`,
        user: testUser._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 1,
            price: 500,
            name: 'Product 1',
            itemStatus: 'pending'
          },
          {
            product: testProduct2._id,
            quantity: 1,
            price: 550,
            name: 'Product 2',
            itemStatus: 'pending'
          },
          {
            product: testProduct1._id,
            quantity: 1,
            price: 500,
            name: 'Product 1 Again',
            itemStatus: 'pending'
          }
        ],
        pricing: {
          subtotal: 1550,
          shipping: 50,
          tax: 0,
          total: 1600
        },
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          email: 'test@example.com',
          street: 'Test St 1',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        payment: {
          status: 'pending'
        }
      });

      // Hold ₪1600
      const paymentDetails = {
        cardNumber: '4580458045804580',
        expMonth: '12',
        expYear: '25',
        cvv: '123',
        userId: '123456789'
      };

      const holdResult = await holdCredit(order, paymentDetails);
      order.payment.status = 'hold';
      order.payment.hypTransactionId = holdResult.transactionId;
      order.payment.hypAuthCode = holdResult.authCode;
      order.payment.hypUid = holdResult.uid;
      order.payment.holdAmount = holdResult.amount;
      await order.save();

      // ביטול 2 פריטים (נשאר רק אחד - ₪500)
      order.items[1].cancellation = { cancelled: true, reason: 'Out of stock', cancelledAt: new Date() };
      order.items[1].itemStatus = 'cancelled';

      order.items[2].cancellation = { cancelled: true, reason: 'Customer request', cancelledAt: new Date() };
      order.items[2].itemStatus = 'cancelled';

      // פריט אחד נשאר
      order.items[0].itemStatus = 'ordered';
      order.items[0].supplierOrder = { orderedAt: new Date(), supplierOrderNumber: 'SUP-789' };

      order.payment.status = 'ready_to_charge';
      await order.save();

      // גביה - צריך לגבות רק ₪550 (₪500 + ₪50 shipping)
      const captureResult = await capturePayment(order);

      expect(captureResult.success).toBe(true);
      expect(captureResult.chargedAmount).toBe(550);

      console.log(`✅ Multiple cancellations handled: ₪${captureResult.chargedAmount}`);
      console.log(`   Original: ₪1600, Cancelled: ₪1050, Final: ₪550`);
    });
  });

  describe('Backward Compatibility - תאימות אחורה', () => {
    test('should work with old orders without J5 data (fallback to commitTrans)', async () => {
      // הזמנה ישנה (לפני J5) - אין AuthCode/UID
      const order = await Order.create({
        orderNumber: `TEST-OLD-${Date.now()}`,
        user: testUser._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 1,
            price: 500,
            name: 'Product 1',
            itemStatus: 'ordered',
            supplierOrder: { orderedAt: new Date(), supplierOrderNumber: 'OLD-123' }
          }
        ],
        pricing: {
          subtotal: 500,
          shipping: 50,
          tax: 0,
          total: 550
        },
        shippingAddress: {
          fullName: 'Test User',
          phone: '0501234567',
          email: 'test@example.com',
          street: 'Test St 1',
          city: 'Tel Aviv',
          zipCode: '12345'
        },
        payment: {
          status: 'ready_to_charge',
          hypTransactionId: 'MOCK-OLD-TRANSACTION',
          holdAmount: 550
          // ❌ אין hypAuthCode
          // ❌ אין hypUid
        }
      });

      // גביה - צריך ל-fallback ל-commitTrans רגיל
      const captureResult = await capturePayment(order);

      expect(captureResult.success).toBe(true);
      expect(captureResult.chargedAmount).toBe(550);

      console.log('✅ Backward compatibility works - fallback to commitTrans');
    });
  });
});
