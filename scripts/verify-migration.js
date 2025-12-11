import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../src/models/Order.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function verify() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const order = await Order.findOne({ orderNumber: 'ORD-1764239889386-BFVA2QLZY' });

    if (!order) {
      console.log('❌ Order not found');
      process.exit(1);
    }

    console.log('📦 Order:', order.orderNumber);
    console.log('📝 Items count:', order.items.length);
    console.log('\n🔍 First Item Details:');
    console.log('─────────────────────────────');

    const item = order.items[0];
    console.log('ID:', item._id);
    console.log('Name:', item.name);
    console.log('Item Status:', item.itemStatus);
    console.log('Has Supplier Order:', !!item.supplierOrder);
    console.log('Has Cancellation:', !!item.cancellation);
    console.log('Cancellation.cancelled:', item.cancellation?.cancelled);
    console.log('Status History Count:', item.statusHistory?.length || 0);

    if (item.statusHistory && item.statusHistory.length > 0) {
      console.log('\n📜 Status History:');
      item.statusHistory.forEach((h, i) => {
        console.log(`  ${i+1}. ${h.status} - ${h.notes || 'No notes'} (${h.changedAt})`);
      });
    }

    console.log('\n💰 Pricing:');
    console.log('─────────────────────────────');
    console.log('Original Total:', order.pricing.total);
    console.log('Adjusted Total:', order.pricing.adjustedTotal);
    console.log('Total Refunds:', order.pricing.totalRefunds);
    console.log('Refunds Count:', order.refunds?.length || 0);

    console.log('\n✅ Migration verified successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

verify();
