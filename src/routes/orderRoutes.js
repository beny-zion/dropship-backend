import express from 'express';
import { auth, adminAuth } from '../middleware/auth.js';
import {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus
} from '../controllers/orderController.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

router.post('/', createOrder);
router.get('/my-orders', getMyOrders);
router.get('/:id', getOrderById);

// Admin only
router.put('/:id/status', adminAuth, updateOrderStatus);

export default router;