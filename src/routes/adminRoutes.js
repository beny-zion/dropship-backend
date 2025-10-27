// routes/adminRoutes.js - Week 5: Complete Admin Routes

import express from 'express';
import { auth, adminAuth } from '../middleware/auth.js';
import { adminRateLimiter } from '../middleware/rateLimiter.js';
import { sanitizeInput } from '../middleware/validators.js';
import { logAdminAction } from '../middleware/auditLogger.js';

// Import all admin controllers
import * as dashboardController from '../controllers/dashboardController.js';
import * as adminProductsController from '../controllers/adminProductsController.js';
import * as adminOrdersController from '../controllers/adminOrdersController.js';
import * as adminUsersController from '../controllers/adminUsersController.js';

// Import validators
import {
  validateProduct,
  validateProductUpdate,
  validateOrderStatus,
  validateMongoId
} from '../middleware/validators.js';

const router = express.Router();

// Apply middleware to all admin routes
router.use(auth); // Must be authenticated
router.use(adminAuth); // Must be admin
router.use(adminRateLimiter); // Rate limiting for admin
router.use(sanitizeInput); // Sanitize all inputs

// ============================================
// DASHBOARD ROUTES
// ============================================

// @route   GET /api/admin/dashboard/stats
router.get(
  '/dashboard/stats',
  dashboardController.getDashboardStats
);

// @route   GET /api/admin/dashboard/recent-orders
router.get(
  '/dashboard/recent-orders',
  dashboardController.getRecentOrders
);

// @route   GET /api/admin/dashboard/top-products
router.get(
  '/dashboard/top-products',
  dashboardController.getTopProducts
);

// @route   GET /api/admin/dashboard/sales-chart
router.get(
  '/dashboard/sales-chart',
  dashboardController.getSalesChartData
);

// @route   GET /api/admin/dashboard/revenue-by-category
router.get(
  '/dashboard/revenue-by-category',
  dashboardController.getRevenueByCategory
);

// @route   GET /api/admin/dashboard/user-growth
router.get(
  '/dashboard/user-growth',
  dashboardController.getUserGrowthData
);

// ============================================
// PRODUCTS MANAGEMENT ROUTES
// ============================================

// @route   GET /api/admin/products
router.get(
  '/products',
  logAdminAction('VIEW_PRODUCTS', 'Product'),
  adminProductsController.getAllProducts
);

// @route   GET /api/admin/products/:id
router.get(
  '/products/:id',
  validateMongoId,
  logAdminAction('VIEW_PRODUCT', 'Product'),
  adminProductsController.getProductById
);

// @route   POST /api/admin/products
router.post(
  '/products',
  validateProduct,
  logAdminAction('CREATE_PRODUCT', 'Product'),
  adminProductsController.createProduct
);

// @route   PUT /api/admin/products/:id
router.put(
  '/products/:id',
  validateMongoId,
  validateProductUpdate,
  logAdminAction('UPDATE_PRODUCT', 'Product'),
  adminProductsController.updateProduct
);

// @route   DELETE /api/admin/products/:id
router.delete(
  '/products/:id',
  validateMongoId,
  logAdminAction('DELETE_PRODUCT', 'Product'),
  adminProductsController.deleteProduct
);

// @route   PATCH /api/admin/products/:id/stock
router.patch(
  '/products/:id/stock',
  validateMongoId,
  logAdminAction('UPDATE_PRODUCT_STOCK', 'Product'),
  adminProductsController.updateStock
);

// @route   PATCH /api/admin/products/:id/featured
router.patch(
  '/products/:id/featured',
  validateMongoId,
  logAdminAction('TOGGLE_PRODUCT_FEATURED', 'Product'),
  adminProductsController.toggleFeatured
);

// @route   PATCH /api/admin/products/:id/status
router.patch(
  '/products/:id/status',
  validateMongoId,
  logAdminAction('UPDATE_PRODUCT_STATUS', 'Product'),
  adminProductsController.updateProductStatus
);

// @route   POST /api/admin/products/bulk-delete
router.post(
  '/products/bulk-delete',
  logAdminAction('BULK_DELETE_PRODUCTS', 'Product'),
  adminProductsController.bulkDeleteProducts
);

// ============================================
// ORDERS MANAGEMENT ROUTES
// ============================================

// @route   GET /api/admin/orders/stats
router.get(
  '/orders/stats',
  adminOrdersController.getOrderStats
);

// @route   GET /api/admin/orders
router.get(
  '/orders',
  logAdminAction('VIEW_ALL_ORDERS', 'Order'),
  adminOrdersController.getAllOrders
);

// @route   GET /api/admin/orders/:id
router.get(
  '/orders/:id',
  validateMongoId,
  logAdminAction('VIEW_ORDER', 'Order'),
  adminOrdersController.getOrderById
);

// @route   PUT /api/admin/orders/:id/status
router.put(
  '/orders/:id/status',
  validateMongoId,
  validateOrderStatus,
  logAdminAction('UPDATE_ORDER_STATUS', 'Order'),
  adminOrdersController.updateOrderStatus
);

// @route   PUT /api/admin/orders/:id/tracking
router.put(
  '/orders/:id/tracking',
  validateMongoId,
  logAdminAction('UPDATE_TRACKING', 'Order'),
  adminOrdersController.updateTracking
);

// @route   POST /api/admin/orders/:id/notes
router.post(
  '/orders/:id/notes',
  validateMongoId,
  logAdminAction('ADD_ORDER_NOTES', 'Order'),
  adminOrdersController.addOrderNotes
);

// @route   DELETE /api/admin/orders/:id
router.delete(
  '/orders/:id',
  validateMongoId,
  logAdminAction('CANCEL_ORDER', 'Order'),
  adminOrdersController.cancelOrder
);

// ============================================
// USERS MANAGEMENT ROUTES
// ============================================

// @route   GET /api/admin/users/stats
router.get(
  '/users/stats',
  adminUsersController.getUsersStats
);

// @route   GET /api/admin/users
router.get(
  '/users',
  logAdminAction('VIEW_ALL_USERS', 'User'),
  adminUsersController.getAllUsers
);

// @route   GET /api/admin/users/:id
router.get(
  '/users/:id',
  validateMongoId,
  logAdminAction('VIEW_USER', 'User'),
  adminUsersController.getUserById
);

// @route   GET /api/admin/users/:id/orders
router.get(
  '/users/:id/orders',
  validateMongoId,
  logAdminAction('VIEW_USER_ORDERS', 'User'),
  adminUsersController.getUserOrders
);

// @route   PATCH /api/admin/users/:id/status
router.patch(
  '/users/:id/status',
  validateMongoId,
  logAdminAction('UPDATE_USER_STATUS', 'User'),
  adminUsersController.updateUserStatus
);

export default router;
