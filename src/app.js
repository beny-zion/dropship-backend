// app.js - Updated for Week 4

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import connectDB from './config/db.js';
import { generalRateLimiter } from './middleware/rateLimiter.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import userRoutes from './routes/userRoutes.js'; // ⭐ New
import addressRoutes from './routes/addressRoutes.js'; // ⭐ New

dotenv.config();

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// 🔒 Rate Limiting כללי על כל ה-API (100 בקשות לדקה)
app.use('/api', generalRateLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes); // ⭐ New
app.use('/api/users/addresses', addressRoutes); // ⭐ New

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date(),
    environment: process.env.NODE_ENV,
    version: '1.0.0 - Week 4'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Amazon Dropship API - Week 4',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      cart: '/api/cart',
      orders: '/api/orders',
      users: '/api/users', // ⭐ New
      addresses: '/api/users/addresses', // ⭐ New
      admin: '/api/admin'
    }
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'נתיב לא נמצא',
    path: req.originalUrl
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'שגיאת שרת',
    ...(process.env.NODE_ENV === 'development' && {
      error: err.stack,
      details: err
    })
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV}`);
  console.log(`📦 Week 5: Admin Panel + Enhanced Security`);
  console.log(`\n🔗 Available endpoints:`);
  console.log(`   - Auth: http://localhost:${PORT}/api/auth`);
  console.log(`   - Products: http://localhost:${PORT}/api/products`);
  console.log(`   - Cart: http://localhost:${PORT}/api/cart`);
  console.log(`   - Orders: http://localhost:${PORT}/api/orders`);
  console.log(`   - Users: http://localhost:${PORT}/api/users`);
  console.log(`   - Addresses: http://localhost:${PORT}/api/users/addresses`);
  console.log(`   - Admin: http://localhost:${PORT}/api/admin`);
  console.log(`\n🔒 Security Features:`);
  console.log(`   ✅ Rate Limiting (100/min general, 200/15min admin, 10/15min auth)`);
  console.log(`   ✅ Audit Logging (all admin actions tracked)`);
  console.log(`   ✅ Input Validation & Sanitization`);
  console.log(`   ✅ Token Blacklist (secure logout)`);
  console.log(`\n✅ Backend Week 5 Ready!`);
});

export default app;