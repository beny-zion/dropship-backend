// routes/adminRoutes.js - Week 5: Complete Admin Routes

import express from 'express';
import { auth, adminAuth } from '../middleware/auth.js';
import { adminRateLimiter } from '../middleware/rateLimiter.js';
import { sanitizeInput } from '../middleware/validators.js';
import { logAdminAction } from '../middleware/auditLogger.js';
// ✅ NEW: Import authorization and audit middleware
import { requireAdminOrManager, checkOrderAccess, userRateLimit } from '../middleware/orderAuthorization.js';
import { auditLog } from '../middleware/auditMiddleware.js';

// Import all admin controllers
import * as dashboardController from '../controllers/dashboardController.js';
import * as adminProductsController from '../controllers/adminProductsController.js';
import * as adminOrdersController from '../controllers/adminOrdersController.js';
import * as adminUsersController from '../controllers/adminUsersController.js';
// ✅ NEW: Import order items controller
import * as adminOrderItemsController from '../controllers/adminOrderItemsController.js';
// ✅ NEW: Import settings controller
import * as adminSettingsController from '../controllers/adminSettingsController.js';

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
// ✅ NEW: Add user-based rate limiting
router.use(userRateLimit(200, 60000)); // 200 requests per minute per user

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
  validateProductUpdate, // Use the new validator that supports name_he, price.ils, etc.
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

// @route   PATCH /api/admin/products/:id/availability
router.patch(
  '/products/:id/availability',
  validateMongoId,
  logAdminAction('UPDATE_PRODUCT_AVAILABILITY', 'Product'),
  adminProductsController.updateProductAvailability
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

// @route   GET /api/admin/orders/kpis
router.get(
  '/orders/kpis',
  logAdminAction('VIEW_ORDER_KPIS', 'Order'),
  adminOrdersController.getOrdersKPIs
);

// @route   GET /api/admin/orders/filtered
router.get(
  '/orders/filtered',
  logAdminAction('VIEW_FILTERED_ORDERS', 'Order'),
  adminOrdersController.getOrdersFiltered
);

// @route   GET /api/admin/orders/items/by-supplier
router.get(
  '/orders/items/by-supplier',
  logAdminAction('VIEW_ITEMS_BY_SUPPLIER', 'Order'),
  adminOrdersController.getItemsGroupedBySupplier
);

// @route   GET /api/admin/orders/stats
router.get(
  '/orders/stats',
  adminOrdersController.getOrderStats
);

// @route   GET /api/admin/orders/items/statistics
router.get(
  '/orders/items/statistics',
  adminOrdersController.getItemStatistics
);

// @route   GET /api/admin/orders/alerts
router.get(
  '/orders/alerts',
  logAdminAction('VIEW_ORDER_ALERTS', 'Order'),
  adminOrdersController.getOrdersWithAlerts
);

// @route   GET /api/admin/orders
router.get(
  '/orders',
  logAdminAction('VIEW_ALL_ORDERS', 'Order'),
  adminOrdersController.getAllOrders
);

// @route   GET /api/admin/orders/:id/statistics
router.get(
  '/orders/:id/statistics',
  validateMongoId,
  logAdminAction('VIEW_ORDER_STATISTICS', 'Order'),
  adminOrdersController.getOrderDetailedStats
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

// @route   PATCH /api/admin/orders/:id/refresh-items
router.patch(
  '/orders/:id/refresh-items',
  validateMongoId,
  logAdminAction('REFRESH_ORDER_ITEMS', 'Order'),
  adminOrdersController.refreshOrderItems
);

// ============================================
// ORDER ITEMS MANAGEMENT ROUTES (NEW)
// ============================================

// @route   PUT /api/admin/orders/:orderId/items/:itemId/status
router.put(
  '/orders/:orderId/items/:itemId/status',
  validateMongoId,
  requireAdminOrManager,
  checkOrderAccess('edit'),
  auditLog('UPDATE_ITEM_STATUS', 'OrderItem'),
  adminOrderItemsController.updateItemStatus
);

// @route   POST /api/admin/orders/:orderId/items/:itemId/order-from-supplier
router.post(
  '/orders/:orderId/items/:itemId/order-from-supplier',
  validateMongoId,
  requireAdminOrManager,
  checkOrderAccess('edit'),
  auditLog('ORDER_FROM_SUPPLIER', 'OrderItem'),
  adminOrderItemsController.orderFromSupplier
);

// @route   POST /api/admin/orders/:orderId/items/:itemId/cancel
router.post(
  '/orders/:orderId/items/:itemId/cancel',
  validateMongoId,
  requireAdminOrManager,
  checkOrderAccess('edit'),
  auditLog('CANCEL_ITEM', 'OrderItem'),
  adminOrderItemsController.cancelItem
);

// @route   GET /api/admin/orders/:orderId/items/:itemId/history
router.get(
  '/orders/:orderId/items/:itemId/history',
  validateMongoId,
  requireAdminOrManager,
  checkOrderAccess('view'),
  auditLog('VIEW_ITEM_HISTORY', 'OrderItem'),
  adminOrderItemsController.getItemHistory
);

// @route   PUT /api/admin/orders/:orderId/items/bulk-update
router.put(
  '/orders/:orderId/items/bulk-update',
  validateMongoId,
  requireAdminOrManager,
  checkOrderAccess('edit'),
  userRateLimit(10, 60000), // ✅ Strict limit for bulk operations: 10 per minute
  auditLog('BULK_UPDATE_ITEMS', 'OrderItem'),
  adminOrderItemsController.bulkUpdateItems
);

// @route   POST /api/admin/orders/items/bulk-order-from-supplier
router.post(
  '/orders/items/bulk-order-from-supplier',
  requireAdminOrManager,
  userRateLimit(5, 60000), // ✅ Very strict limit: 5 per minute
  auditLog('BULK_ORDER_FROM_SUPPLIER', 'OrderItem'),
  adminOrderItemsController.bulkOrderFromSupplier
);

// ============================================
// SYSTEM SETTINGS ROUTES (NEW)
// ============================================

// @route   GET /api/admin/settings
router.get(
  '/settings',
  logAdminAction('VIEW_SETTINGS', 'SystemSettings'),
  adminSettingsController.getSystemSettings
);

// @route   PUT /api/admin/settings
router.put(
  '/settings',
  requireAdminOrManager,
  logAdminAction('UPDATE_SETTINGS', 'SystemSettings'),
  adminSettingsController.updateSystemSettings
);

// @route   GET /api/admin/settings/shipping-rate
router.get(
  '/settings/shipping-rate',
  adminSettingsController.getShippingRate
);

// @route   POST /api/admin/settings/reset
router.post(
  '/settings/reset',
  requireAdminOrManager,
  logAdminAction('RESET_SETTINGS', 'SystemSettings'),
  adminSettingsController.resetSystemSettings
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
