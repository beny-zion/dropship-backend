// seed-demo-orders.js - Create demo orders for testing Admin Panel

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './src/models/Order.js';
import Product from './src/models/Product.js';
import User from './src/models/User.js';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const seedDemoOrders = async () => {
  try {
    console.log('🌱 Starting to seed demo orders...\n');

    // Get existing products and users
    const products = await Product.find().limit(5);
    const users = await User.find({ role: 'user' }).limit(3);

    if (products.length === 0) {
      console.log('❌ No products found. Please seed products first.');
      return;
    }

    if (users.length === 0) {
      console.log('❌ No users found. Please create at least one user first.');
      return;
    }

    console.log(`📦 Found ${products.length} products`);
    console.log(`👥 Found ${users.length} users\n`);

    // Create demo orders
    const demoOrders = [];
    const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'pending'];

    for (let i = 0; i < 10; i++) {
      const user = users[i % users.length];
      const numItems = Math.floor(Math.random() * 3) + 1; // 1-3 items per order
      const orderProducts = [];
      let subtotal = 0;

      for (let j = 0; j < numItems; j++) {
        const product = products[Math.floor(Math.random() * products.length)];
        const quantity = Math.floor(Math.random() * 2) + 1;
        const price = product.price?.ils || 100;

        orderProducts.push({
          product: product._id,
          quantity,
          price,
          name: product.name_he,
          image: product.images?.[0]?.url || '',
          asin: product.asin
        });

        subtotal += price * quantity;
      }

      const shipping = 0; // Free shipping
      const tax = Math.round(subtotal * 0.17); // 17% VAT
      const discount = 0;
      const total = subtotal + shipping + tax - discount;

      // Create order date (last 30 days)
      const daysAgo = Math.floor(Math.random() * 30);
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - daysAgo);

      const status = statuses[i % statuses.length];

      demoOrders.push({
        orderNumber: `AM${String(100000 + i).slice(1)}`,
        user: user._id,
        items: orderProducts,
        shippingAddress: {
          fullName: `${user.firstName} ${user.lastName}`,
          phone: user.phone || '0501234567',
          email: user.email,
          street: 'רחוב הדמו 123',
          city: 'תל אביב',
          zipCode: '1234567',
          apartment: '4',
          floor: '2'
        },
        shipping: {
          fullName: `${user.firstName} ${user.lastName}`,
          phone: user.phone || '0501234567',
          street: 'רחוב הדמו 123',
          city: 'תל אביב',
          zipCode: '1234567',
          apartment: '4',
          floor: '2'
        },
        pricing: {
          subtotal,
          shipping,
          tax,
          discount,
          total
        },
        payment: {
          method: 'credit_card',
          status: status === 'delivered' || status === 'shipped' ? 'completed' : 'pending',
          transactionId: `TXN${Date.now()}${i}`
        },
        status,
        createdAt: orderDate,
        updatedAt: orderDate
      });
    }

    // Insert orders
    const result = await Order.insertMany(demoOrders);
    console.log(`✅ Created ${result.length} demo orders\n`);

    // Display summary
    console.log('📊 Orders Summary:');
    console.log(`   • Total Orders: ${result.length}`);
    console.log(`   • Delivered: ${result.filter(o => o.status === 'delivered').length}`);
    console.log(`   • Shipped: ${result.filter(o => o.status === 'shipped').length}`);
    console.log(`   • Processing: ${result.filter(o => o.status === 'processing').length}`);
    console.log(`   • Pending: ${result.filter(o => o.status === 'pending').length}`);

    const totalRevenue = result
      .filter(o => o.payment.status === 'completed')
      .reduce((sum, o) => sum + o.pricing.total, 0);

    console.log(`   • Total Revenue: ₪${totalRevenue.toLocaleString()}\n`);

    console.log('🎉 Demo orders seeded successfully!');
    console.log('   Now you can see data in your Admin Panel Dashboard!\n');

  } catch (error) {
    console.error('❌ Error seeding orders:', error);
  }
};

// Run the seeder
(async () => {
  await connectDB();
  await seedDemoOrders();
  mongoose.connection.close();
  console.log('✅ Database connection closed');
})();
