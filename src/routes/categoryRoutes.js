import express from 'express';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  incrementCategoryClick,
  uploadCategoryImage,
  getCategoryStats,
} from '../controllers/categoryController.js';
import { auth, adminAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Public routes
router.get('/', getCategories);
router.get('/stats', auth, adminAuth, getCategoryStats);
router.get('/:identifier', getCategoryById);
router.post('/:id/click', incrementCategoryClick);

// Admin only routes
router.post('/', auth, adminAuth, createCategory);
router.put('/:id', auth, adminAuth, updateCategory);
router.delete('/:id', auth, adminAuth, deleteCategory);
router.put('/reorder/batch', auth, adminAuth, reorderCategories);
router.post('/:id/upload', auth, adminAuth, upload.single('image'), uploadCategoryImage);

export default router;
