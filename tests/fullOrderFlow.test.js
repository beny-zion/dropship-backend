/**
 * בדיקת תזרים הזמנה מלא - מהתחלה ועד גביה
 *
 * הבדיקה הזו מדמה הזמנה אמיתית:
 * 1. יצירת הזמנה חדשה
 * 2. תפיסת מסגרת אשראי (hold)
 * 3. הזמנת פריטים מהספק
 * 4. זיהוי אוטומטי שמוכן לגביה
 * 5. גביית התשלום
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import { holdCredit, capturePayment } from '../src/services/paymentService.js';
import dotenv from 'dotenv';

dotenv.config();

describe('🛒 תזרים הזמנה מלא - דוגמה מלאה', () => {
  let testOrder;

  beforeAll(async () => {
    // חיבור ל-DB
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    // נקה הזמנות בדיקה קודמות
    await Order.deleteMany({ orderNumber: /^DEMO-/ });
  }, 30000); // 30 seconds timeout

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('📋 שלב 1: יצירת הזמנה חדשה', async () => {
    console.log('\n' + '='.repeat(70));
    console.log('🛒 לקוח יוצר הזמנה חדשה');
    console.log('='.repeat(70));

    // יצירת הזמנה
    testOrder = new Order({
      orderNumber: 'DEMO-' + Date.now(),
      user: new mongoose.Types.ObjectId(),
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: 'נעלי ספורט Nike Air Max',
          price: 450,
          quantity: 1,
          itemStatus: 'pending',
          supplierName: 'Amazon',
          asin: 'B07XYZ1234'
        },
        {
          product: new mongoose.Types.ObjectId(),
          name: 'חולצת פולו Ralph Lauren',
          price: 250,
          quantity: 1,
          itemStatus: 'pending',
          supplierName: 'Amazon',
          asin: 'B08ABC5678'
        }
      ],
      shippingAddress: {
        fullName: 'ישראל ישראלי',
        email: 'israel@example.com',
        phone: '050-1234567',
        street: 'רחוב הרצל 10',
        city: 'תל אביב',
        zipCode: '12345',
        apartment: '5',
        floor: '2'
      },
      pricing: {
        subtotal: 700,      // 450 + 250
        tax: 0,
        shipping: 49,       // משלוח קבוע
        total: 749          // 700 + 49
      },
      payment: {
        method: 'credit_card',
        status: 'pending'
      }
    });

    await testOrder.save();

    console.log('\n📦 פרטי ההזמנה:');
    console.log(`   מספר הזמנה: ${testOrder.orderNumber}`);
    console.log(`   לקוח: ${testOrder.shippingAddress.fullName}`);
    console.log(`   טלפון: ${testOrder.shippingAddress.phone}`);
    console.log(`   כתובת: ${testOrder.shippingAddress.street}, ${testOrder.shippingAddress.city}`);

    console.log('\n🛍️  פריטים בהזמנה:');
    testOrder.items.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.name}`);
      console.log(`      מחיר: ₪${item.price}`);
      console.log(`      כמות: ${item.quantity}`);
      console.log(`      ספק: ${item.supplierName}`);
      console.log(`      סטטוס: ${item.itemStatus}`);
    });

    console.log('\n💰 פירוט מחירים:');
    console.log(`   סכום ביניים: ₪${testOrder.pricing.subtotal}`);
    console.log(`   משלוח: ₪${testOrder.pricing.shipping}`);
    console.log(`   ───────────────`);
    console.log(`   סה"כ לתשלום: ₪${testOrder.pricing.total}`);

    console.log('\n💳 סטטוס תשלום:');
    console.log(`   סטטוס: ${testOrder.payment.status}`);
    console.log(`   שיטת תשלום: ${testOrder.payment.method}`);

    expect(testOrder.payment.status).toBe('pending');
    expect(testOrder.items).toHaveLength(2);
    expect(testOrder.pricing.total).toBe(749);
  }, 15000); // 15 seconds timeout

  it('💳 שלב 2: תפיסת מסגרת אשראי (Hold)', async () => {
    console.log('\n' + '='.repeat(70));
    console.log('💳 תפיסת מסגרת אשראי - לא גובים עדיין!');
    console.log('='.repeat(70));

    // בדוק משתני סביבה
    console.log('\n🔍 בדיקת משתני סביבה:');
    console.log(`   HYP_MASOF: ${process.env.HYP_MASOF || 'חסר ❌'}`);
    console.log(`   HYP_PASSP: ${process.env.HYP_PASSP || 'חסר ❌'}`);
    console.log(`   HYP_TEST_MODE: ${process.env.HYP_TEST_MODE || 'false'}`);
    console.log(`   HYP_API_URL: ${process.env.HYP_API_URL || 'default'}`);

    // פרטי כרטיס אשראי של הלקוח
    const paymentDetails = {
      cardNumber: '5326105300985614',  // כרטיס בדיקה של Hyp Pay
      expMonth: '12',
      expYear: '25',
      cvv: '125',
      userId: '000000000'
    };

    console.log('\n💳 פרטי תשלום:');
    console.log(`   כרטיס: **** **** **** ${paymentDetails.cardNumber.slice(-4)}`);
    console.log(`   תוקף: ${paymentDetails.expMonth}/${paymentDetails.expYear}`);
    console.log(`   סכום לנעילה: ₪${testOrder.pricing.total}`);

    console.log('\n⏳ שולח בקשה ל-Hyp Pay...');

    // תפיסת מסגרת
    const holdResult = await holdCredit(testOrder, paymentDetails);

    console.log('\n📥 תשובה מ-Hyp Pay:');
    console.log('─'.repeat(70));
    console.log('Raw Response:', JSON.stringify(holdResult, null, 2));
    console.log('─'.repeat(70));
    if (holdResult.success) {
      console.log('✅ סטטוס: הצלחה!');
      console.log(`   מזהה עסקה: ${holdResult.transactionId}`);
      console.log(`   סכום שננעל: ₪${holdResult.amount}`);
      console.log(`   הודעה: ${holdResult.message}`);

      // עדכן את ההזמנה
      testOrder.payment.status = 'hold';
      testOrder.payment.hypTransactionId = holdResult.transactionId;
      testOrder.payment.holdAmount = holdResult.amount;
      testOrder.payment.holdAt = new Date();
      testOrder.payment.paymentHistory = [{
        action: 'hold',
        amount: holdResult.amount,
        transactionId: holdResult.transactionId,
        success: true,
        timestamp: new Date()
      }];

      await testOrder.save();

      console.log('\n💾 ההזמנה עודכנה במערכת:');
      console.log(`   payment.status: ${testOrder.payment.status}`);
      console.log(`   payment.hypTransactionId: ${testOrder.payment.hypTransactionId}`);
      console.log(`   payment.holdAmount: ₪${testOrder.payment.holdAmount}`);
      console.log(`   payment.holdAt: ${testOrder.payment.holdAt.toLocaleString('he-IL')}`);

      console.log('\n📝 היסטוריית תשלומים:');
      testOrder.payment.paymentHistory.forEach((entry, index) => {
        console.log(`   ${index + 1}. ${entry.action} - ₪${entry.amount} - ${entry.success ? '✅' : '❌'}`);
        console.log(`      מזהה: ${entry.transactionId}`);
        console.log(`      זמן: ${entry.timestamp.toLocaleString('he-IL')}`);
      });

    } else {
      console.log('❌ סטטוס: כשלון');
      console.log(`   שגיאה: ${holdResult.error}`);
      console.log(`   קוד שגיאה: ${holdResult.code}`);
    }
    console.log('─'.repeat(70));

    expect(holdResult.success).toBe(true);
    expect(holdResult.transactionId).toBeDefined();
    expect(testOrder.payment.status).toBe('hold');
  }, 20000); // 20 seconds timeout

  it('📦 שלב 3: מנהל מזמין את הפריטים מהספק', async () => {
    console.log('\n' + '='.repeat(70));
    console.log('👨‍💼 מנהל מזמין פריטים מ-Amazon');
    console.log('='.repeat(70));

    // טען את ההזמנה מחדש
    testOrder = await Order.findById(testOrder._id);

    console.log('\n📋 לפני הזמנה:');
    testOrder.items.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.name}`);
      console.log(`      סטטוס: ${item.itemStatus}`);
    });

    // מנהל מסמן את הפריט הראשון כהוזמן
    console.log('\n⏳ מזמין פריט 1...');
    testOrder.items[0].itemStatus = 'ordered';
    testOrder.items[0].supplierOrder = {
      orderedAt: new Date(),
      orderedBy: new mongoose.Types.ObjectId(),
      supplierOrderNumber: 'AMZ-112-123456',
      notes: 'הוזמן בהצלחה'
    };

    await testOrder.save();
    console.log('✅ פריט 1 הוזמן!');

    // מנהל מסמן את הפריט השני כהוזמן
    console.log('⏳ מזמין פריט 2...');
    testOrder = await Order.findById(testOrder._id);
    testOrder.items[1].itemStatus = 'ordered';
    testOrder.items[1].supplierOrder = {
      orderedAt: new Date(),
      orderedBy: new mongoose.Types.ObjectId(),
      supplierOrderNumber: 'AMZ-112-123457',
      notes: 'הוזמן בהצלחה'
    };

    await testOrder.save();
    console.log('✅ פריט 2 הוזמן!');

    // טען מחדש כדי לראות את השינויים
    testOrder = await Order.findById(testOrder._id);

    console.log('\n📋 אחרי הזמנה:');
    testOrder.items.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.name}`);
      console.log(`      סטטוס: ${item.itemStatus}`);
      if (item.supplierOrder) {
        console.log(`      מספר הזמנת ספק: ${item.supplierOrder.supplierOrderNumber}`);
        console.log(`      הוזמן ב: ${item.supplierOrder.orderedAt.toLocaleString('he-IL')}`);
      }
    });

    console.log('\n🤖 Pre-Save Hook פעל אוטומטית!');
    console.log(`   payment.status השתנה ל: ${testOrder.payment.status}`);

    if (testOrder.payment.status === 'ready_to_charge') {
      console.log('   ✅ כל הפריטים הוכרעו - ההזמנה מוכנה לגביה!');
    }

    console.log('\n📝 טיימליין של ההזמנה:');
    testOrder.timeline.forEach((entry, index) => {
      console.log(`   ${index + 1}. [${entry.status}] ${entry.message}`);
      console.log(`      ${entry.timestamp.toLocaleString('he-IL')}`);
    });

    expect(testOrder.items[0].itemStatus).toBe('ordered');
    expect(testOrder.items[1].itemStatus).toBe('ordered');
    expect(testOrder.payment.status).toBe('ready_to_charge');
  }, 15000); // 15 seconds timeout

  it('💰 שלב 4: גביית תשלום אוטומטית', async () => {
    console.log('\n' + '='.repeat(70));
    console.log('💰 Job רץ וגובה את התשלום');
    console.log('='.repeat(70));

    // טען את ההזמנה
    testOrder = await Order.findById(testOrder._id);

    console.log('\n📊 מצב לפני גביה:');
    console.log(`   payment.status: ${testOrder.payment.status}`);
    console.log(`   payment.holdAmount: ₪${testOrder.payment.holdAmount}`);
    console.log(`   payment.chargedAmount: ₪${testOrder.payment.chargedAmount || 0}`);

    console.log('\n⏳ מבצע גביה דרך Hyp Pay...');

    // חישוב סכום סופי
    const activeItems = testOrder.items.filter(item => !item.cancellation?.cancelled);
    const subtotal = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const finalAmount = subtotal + testOrder.pricing.shipping;

    console.log('\n💵 חישוב סכום סופי:');
    activeItems.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.name}: ₪${item.price} x ${item.quantity} = ₪${item.price * item.quantity}`);
    });
    console.log(`   משלוח: ₪${testOrder.pricing.shipping}`);
    console.log(`   ───────────────`);
    console.log(`   סה"כ לגביה: ₪${finalAmount}`);

    // בצע גביה
    const captureResult = await capturePayment(testOrder);

    console.log('\n📥 תשובה מ-Hyp Pay:');
    console.log('─'.repeat(70));
    if (captureResult.success) {
      console.log('✅ סטטוס: הצלחה!');
      console.log(`   סכום שנגבה: ₪${captureResult.chargedAmount}`);
      console.log(`   מזהה עסקה: ${captureResult.transactionId || testOrder.payment.hypTransactionId}`);
      console.log(`   הודעה: ${captureResult.message}`);

      // עדכן הזמנה
      testOrder.payment.status = 'charged';
      testOrder.payment.chargedAmount = captureResult.chargedAmount;
      testOrder.payment.chargedAt = new Date();

      testOrder.payment.paymentHistory.push({
        action: 'charge',
        amount: captureResult.chargedAmount,
        transactionId: captureResult.transactionId || testOrder.payment.hypTransactionId,
        success: true,
        timestamp: new Date()
      });

      testOrder.timeline.push({
        status: 'charged',
        message: `תשלום נגבה: ₪${captureResult.chargedAmount}`,
        timestamp: new Date()
      });

      await testOrder.save();

    } else {
      console.log('❌ סטטוס: כשלון');
      console.log(`   שגיאה: ${captureResult.error}`);
      console.log(`   קוד שגיאה: ${captureResult.code}`);
    }
    console.log('─'.repeat(70));

    // טען מחדש
    testOrder = await Order.findById(testOrder._id);

    console.log('\n💾 המצב הסופי של ההזמנה:');
    console.log(`   מספר הזמנה: ${testOrder.orderNumber}`);
    console.log(`   payment.status: ${testOrder.payment.status}`);
    console.log(`   payment.holdAmount: ₪${testOrder.payment.holdAmount}`);
    console.log(`   payment.chargedAmount: ₪${testOrder.payment.chargedAmount}`);
    console.log(`   payment.holdAt: ${testOrder.payment.holdAt.toLocaleString('he-IL')}`);
    console.log(`   payment.chargedAt: ${testOrder.payment.chargedAt?.toLocaleString('he-IL') || 'לא נגבה'}`);

    console.log('\n📝 היסטוריית תשלומים מלאה:');
    testOrder.payment.paymentHistory.forEach((entry, index) => {
      console.log(`   ${index + 1}. [${entry.action}] ₪${entry.amount}`);
      console.log(`      מזהה: ${entry.transactionId}`);
      console.log(`      סטטוס: ${entry.success ? '✅ הצלחה' : '❌ כשלון'}`);
      console.log(`      זמן: ${entry.timestamp.toLocaleString('he-IL')}`);
      if (entry.error) {
        console.log(`      שגיאה: ${entry.error}`);
      }
    });

    console.log('\n📝 טיימליין מלא:');
    testOrder.timeline.forEach((entry, index) => {
      console.log(`   ${index + 1}. [${entry.status}] ${entry.message}`);
      console.log(`      ${entry.timestamp.toLocaleString('he-IL')}`);
    });

    console.log('\n🎉 ההזמנה הושלמה בהצלחה!');
    console.log('─'.repeat(70));
    console.log('סיכום:');
    console.log(`✅ לקוח הזמין 2 פריטים בסך ₪${testOrder.pricing.subtotal}`);
    console.log(`✅ נעלה מסגרת אשראי של ₪${testOrder.payment.holdAmount}`);
    console.log(`✅ מנהל הזמין את הפריטים מהספק`);
    console.log(`✅ המערכת זיהתה אוטומטית שמוכן לגביה`);
    console.log(`✅ נגבו ₪${testOrder.payment.chargedAmount} (כולל משלוח)`);
    console.log('─'.repeat(70));

    expect(captureResult.success).toBe(true);
    expect(testOrder.payment.status).toBe('charged');
    expect(testOrder.payment.chargedAmount).toBe(finalAmount);
  }, 25000); // 25 seconds timeout
});

console.log('\n✅ בדיקת תזרים הזמנה מלא מוכנה לריצה!');
console.log('הרץ: npm test -- fullOrderFlow.test.js');
