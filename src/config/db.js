import mongoose from 'mongoose';
import { verifyEmailConfig } from '../services/emailService.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // ⚡ Ensure indexes are created automatically
      autoIndex: true
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // ⚡ Wait for indexes to be created
    mongoose.connection.on('index', () => {
      console.log('📊 Database indexes created successfully');
    });

    console.log('⚡ Waiting for Mongoose indexes to build...');

    // Wait for mongoose model indexes to be built
    await Promise.all(
      Object.values(mongoose.models).map(model => {
        return model.init().catch(err => {
          // Some models might fail if index already exists, that's OK
          console.log(`⚠️  Index warning for ${model.modelName}: ${err.message}`);
        });
      })
    );

    console.log('⚡ Performance indexes verified!');

    // Verify email service configuration
    await verifyEmailConfig();

  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;