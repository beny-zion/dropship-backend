// seed-order-statuses.js - Seed Order Statuses

import mongoose from 'mongoose';
import OrderStatus from './src/models/OrderStatus.js';
import dotenv from 'dotenv';

dotenv.config();

const orderStatuses = [
  {
    key: 'pending',
    label_he: 'ממתין לאישור',
    label_en: 'Pending',
    description: 'הזמנה חדשה שהתקבלה במערכת',
    color: 'yellow',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    order: 1,
    isActive: true,
    isSystem: true
  },
  {
    key: 'payment_hold',
    label_he: 'מסגרת אשראי תפוסה',
    label_en: 'Payment Hold',
    description: 'מסגרת האשראי נעולה בהצלחה',
    color: 'orange',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-800',
    order: 2,
    isActive: true,
    isSystem: true
  },
  {
    key: 'ordered',
    label_he: 'הוזמן מארה"ב',
    label_en: 'Ordered from US',
    description: 'ההזמנה בוצעה מהספק בארה"ב',
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    order: 3,
    isActive: true,
    isSystem: false
  },
  {
    key: 'arrived_us_warehouse',
    label_he: 'הגיע למחסן ארה"ב',
    label_en: 'Arrived at US Warehouse',
    description: 'המשלוח הגיע למרכז הלוגיסטי בארה"ב',
    color: 'indigo',
    bgColor: 'bg-indigo-100',
    textColor: 'text-indigo-800',
    order: 4,
    isActive: true,
    isSystem: false
  },
  {
    key: 'shipped_to_israel',
    label_he: 'נשלח לישראל',
    label_en: 'Shipped to Israel',
    description: 'המשלוח יצא בדרך לישראל',
    color: 'purple',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-800',
    order: 5,
    isActive: true,
    isSystem: false
  },
  {
    key: 'customs_israel',
    label_he: 'במכס בישראל',
    label_en: 'At Israeli Customs',
    description: 'המשלוח הגיע למכס בישראל',
    color: 'pink',
    bgColor: 'bg-pink-100',
    textColor: 'text-pink-800',
    order: 6,
    isActive: true,
    isSystem: false
  },
  {
    key: 'arrived_israel_warehouse',
    label_he: 'הגיע למחסן בישראל',
    label_en: 'Arrived at Israeli Warehouse',
    description: 'המשלוח הגיע למרכז הלוגיסטי בישראל',
    color: 'cyan',
    bgColor: 'bg-cyan-100',
    textColor: 'text-cyan-800',
    order: 7,
    isActive: true,
    isSystem: false
  },
  {
    key: 'shipped_to_customer',
    label_he: 'נשלח ללקוח',
    label_en: 'Shipped to Customer',
    description: 'המשלוח יצא אל הלקוח',
    color: 'teal',
    bgColor: 'bg-teal-100',
    textColor: 'text-teal-800',
    order: 8,
    isActive: true,
    isSystem: false
  },
  {
    key: 'delivered',
    label_he: 'נמסר',
    label_en: 'Delivered',
    description: 'ההזמנה נמסרה ללקוח',
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    order: 9,
    isActive: true,
    isSystem: true
  },
  {
    key: 'cancelled',
    label_he: 'בוטל',
    label_en: 'Cancelled',
    description: 'ההזמנה בוטלה',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
    order: 10,
    isActive: true,
    isSystem: true
  }
];

async function seedOrderStatuses() {
  try {
    console.log('🔌 מתחבר למסד הנתונים...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ התחברות הצליחה');

    console.log('🗑️  מוחק סטטוסים קיימים...');
    await OrderStatus.deleteMany({});

    console.log('📝 יוצר סטטוסים חדשים...');
    await OrderStatus.insertMany(orderStatuses);

    console.log('✅ נוצרו בהצלחה', orderStatuses.length, 'סטטוסים');

    // הצגת הסטטוסים
    const statuses = await OrderStatus.find().sort({ order: 1 });
    console.log('\n📋 הסטטוסים במערכת:');
    statuses.forEach(status => {
      console.log(`  ${status.order}. [${status.key}] ${status.label_he} (${status.color})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ שגיאה:', error);
    process.exit(1);
  }
}

seedOrderStatuses();
