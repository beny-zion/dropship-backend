import express from 'express';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts
} from '../controllers/adminController.js';
import { auth, adminAuth } from '../middleware/auth.js';
import { adminRateLimiter } from '../middleware/rateLimiter.js';
import { logAdminAction } from '../middleware/auditLogger.js';
import {
  validateProduct,
  validateProductUpdate,
  validateMongoId,
  sanitizeInput
} from '../middleware/validators.js';

const router = express.Router();

// 🔒 שכבת אבטחה 1: Rate Limiting (מגביל בקשות)
router.use(adminRateLimiter);

// 🔒 שכבת אבטחה 2: Sanitization (ניקוי input)
router.use(sanitizeInput);

// 🔒 שכבת אבטחה 3: Authentication + Authorization
router.use(auth);
router.use(adminAuth);

// Products Routes
router.route('/products')
  .get(
    logAdminAction('VIEW_ALL_PRODUCTS', 'Product'),
    getAllProducts
  )
  .post(
    validateProduct, // Validation
    logAdminAction('CREATE_PRODUCT', 'Product'),
    createProduct
  );

router.route('/products/:id')
  .put(
    validateMongoId, // בדיקת ID
    validateProductUpdate, // Validation
    logAdminAction('UPDATE_PRODUCT', 'Product'),
    updateProduct
  )
  .delete(
    validateMongoId, // בדיקת ID
    logAdminAction('DELETE_PRODUCT', 'Product'),
    deleteProduct
  );

export default router;