// routes/orderRoutes.js - Enhanced for Week 4

import express from 'express';
import { auth, adminAuth } from '../middleware/auth.js';
import {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getOrderStats
} from '../controllers/orderController.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// User routes
router.post('/', createOrder);
router.get('/my-orders', getMyOrders);
router.get('/stats', getOrderStats);
router.get('/:id', getOrderById);
router.put('/:id/cancel', cancelOrder);

// Admin only routes
router.put('/:id/status', adminAuth, updateOrderStatus);

export default router;