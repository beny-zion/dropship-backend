// app.js - Week 5: Admin Panel Complete

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import connectDB from './config/db.js';
import { generalRateLimiter } from './middleware/rateLimiter.js';
import { sanitizePublicResponse } from './middleware/sanitizeResponse.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import userRoutes from './routes/userRoutes.js';
import addressRoutes from './routes/addressRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';

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

app.use(express.json({ limit: '10mb' })); // הגדלת מגבלה להעלאת תמונות
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// 🔒 Sanitize public responses - remove sensitive data from client responses
app.use(sanitizePublicResponse);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes); // ⭐ Complete Admin Panel
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/users/addresses', addressRoutes);
app.use('/api/upload', uploadRoutes); // 📤 Image Upload (Cloudinary)
app.use('/api/categories', categoryRoutes); // 🏷️ Categories Management

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date(),
    environment: process.env.NODE_ENV,
    version: '2.0.0 - Week 5'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Amazon Dropship API - Week 5: Admin Panel Complete',
    version: '2.0.0',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      cart: '/api/cart',
      orders: '/api/orders',
      users: '/api/users',
      addresses: '/api/users/addresses',
      admin: {
        dashboard: '/api/admin/dashboard/*',
        products: '/api/admin/products',
        orders: '/api/admin/orders',
        users: '/api/admin/users'
      }
    },
    features: {
      security: [
        'Rate Limiting',
        'Audit Logging',
        'Input Validation',
        'Token Blacklist'
      ],
      admin: [
        'Dashboard with Analytics',
        'Products Management',
        'Orders Management',
        'Users Management',
        'Real-time Statistics'
      ]
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
  console.log('\n🚀 ════════════════════════════════════════════════════');
  console.log(`   Amazon Dropship API - Week 5`);
  console.log('   ════════════════════════════════════════════════════\n');
  
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📦 Version: 2.0.0\n`);
  
  console.log('🔗 Public Endpoints:');
  console.log(`   • Auth:     http://localhost:${PORT}/api/auth`);
  console.log(`   • Products: http://localhost:${PORT}/api/products`);
  console.log(`   • Cart:     http://localhost:${PORT}/api/cart`);
  console.log(`   • Orders:   http://localhost:${PORT}/api/orders`);
  console.log(`   • Users:    http://localhost:${PORT}/api/users\n`);
  
  console.log('🔐 Admin Panel Endpoints:');
  console.log(`   • Dashboard:  http://localhost:${PORT}/api/admin/dashboard/stats`);
  console.log(`   • Products:   http://localhost:${PORT}/api/admin/products`);
  console.log(`   • Orders:     http://localhost:${PORT}/api/admin/orders`);
  console.log(`   • Users:      http://localhost:${PORT}/api/admin/users\n`);
  
  console.log('🔒 Security Features:');
  console.log('   ✅ Rate Limiting');
  console.log('      • General: 100 requests/min');
  console.log('      • Admin: 200 requests/15min');
  console.log('      • Auth: 10 requests/15min');
  console.log('   ✅ Audit Logging (all admin actions)');
  console.log('   ✅ Input Validation & Sanitization');
  console.log('   ✅ Token Blacklist (secure logout)\n');
  
  console.log('📊 Admin Features:');
  console.log('   ✅ Real-time Dashboard & Analytics');
  console.log('   ✅ Products CRUD with bulk operations');
  console.log('   ✅ Orders Management & Tracking');
  console.log('   ✅ Users Management & Statistics');
  console.log('   ✅ Sales Charts & Reports\n');
  
  console.log('✅ Backend Week 5 Complete!\n');
  console.log('════════════════════════════════════════════════════\n');
});

export default app;
