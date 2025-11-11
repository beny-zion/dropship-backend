import mongoose from 'mongoose';
import Order from './src/models/Order.js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI);
console.log('✅ Connected to MongoDB');

// Find all orders with empty date objects
const orders = await Order.find({}).lean();

console.log(`Found ${orders.length} orders`);

let fixed = 0;

for (const order of orders) {
  const update = {};
  let needsUpdate = false;

  // Check if createdAt is empty object
  if (!order.createdAt || (typeof order.createdAt === 'object' && !(order.createdAt instanceof Date))) {
    update.createdAt = order._id.getTimestamp();
    needsUpdate = true;
    console.log(`Order ${order.orderNumber}: fixing createdAt`);
  }

  // Check if updatedAt is empty object
  if (!order.updatedAt || (typeof order.updatedAt === 'object' && !(order.updatedAt instanceof Date))) {
    update.updatedAt = order._id.getTimestamp();
    needsUpdate = true;
    console.log(`Order ${order.orderNumber}: fixing updatedAt`);
  }

  // Fix timeline timestamps
  if (order.timeline && Array.isArray(order.timeline)) {
    const fixedTimeline = order.timeline.map(item => {
      if (!item.timestamp || (typeof item.timestamp === 'object' && !(item.timestamp instanceof Date))) {
        return {
          ...item,
          timestamp: order._id.getTimestamp()
        };
      }
      return item;
    });

    // Check if any timeline item was fixed
    const timelineNeedsUpdate = order.timeline.some((item, i) => {
      return !item.timestamp || (typeof item.timestamp === 'object' && !(item.timestamp instanceof Date));
    });

    if (timelineNeedsUpdate) {
      update.timeline = fixedTimeline;
      needsUpdate = true;
      console.log(`Order ${order.orderNumber}: fixing timeline timestamps`);
    }
  }

  if (needsUpdate) {
    await Order.updateOne({ _id: order._id }, { $set: update });
    fixed++;
    console.log(`✅ Fixed order ${order.orderNumber}`);
  }
}

console.log(`\n✅ Fixed ${fixed} out of ${orders.length} orders`);

await mongoose.disconnect();
console.log('✅ Disconnected from MongoDB');
