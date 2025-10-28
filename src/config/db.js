import mongoose from 'mongoose';

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

    // Manually trigger index creation for all models
    await Promise.all([
      mongoose.connection.db.collection('products').createIndexes([
        { key: { asin: 1 }, unique: true },
        { key: { slug: 1 }, unique: true },
        { key: { category: 1 } },
        { key: { 'price.ils': 1 } },
        { key: { status: 1 } },
        { key: { name_he: 'text', description_he: 'text' } }
      ]),
      mongoose.connection.db.collection('carts').createIndexes([
        { key: { user: 1 }, unique: true }
      ])
    ]);

    console.log('⚡ Performance indexes verified!');

  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;