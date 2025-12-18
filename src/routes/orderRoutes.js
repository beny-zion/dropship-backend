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

// ✅ Admin Order Items Controller
import {
  updateItemStatus,
  orderFromSupplier,
  cancelItem,
  getItemHistory,
  bulkUpdateItems
} from '../controllers/adminOrderItemsController.js';

// ✅ Customer Cancellation Controller (Phase 4)
import {
  requestItemCancellation,
  checkCancellationEligibility
} from '../controllers/customerCancellationController.js';

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

// ✅ Admin Item Management Routes
router.put('/:orderId/items/:itemId/status', adminAuth, updateItemStatus);
router.post('/:orderId/items/:itemId/order-from-supplier', adminAuth, orderFromSupplier);
router.post('/:orderId/items/:itemId/cancel', adminAuth, cancelItem);
router.get('/:orderId/items/:itemId/history', adminAuth, getItemHistory);
router.put('/:orderId/items/bulk-update', adminAuth, bulkUpdateItems);

// ✅ Customer Cancellation Routes (Phase 4)
// These routes allow customers to cancel their own items (only if pending)
router.post('/:orderId/items/:itemId/request-cancel', requestItemCancellation);
router.get('/:orderId/items/:itemId/can-cancel', checkCancellationEligibility);

export default router;