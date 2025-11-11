import express from 'express';
import {
  getProducts,
  getProductById,
  getCategories,
  getPopularTags,
  trackClick
} from '../controllers/productController.js';

const router = express.Router();

router.get('/', getProducts);
router.get('/categories', getCategories);
router.get('/tags', getPopularTags);
router.get('/:id', getProductById);
router.post('/:id/click', trackClick);

export default router;