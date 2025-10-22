import express from 'express';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts
} from '../controllers/adminController.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// כל הroutes דורשים authentication + admin
router.use(auth);
router.use(adminAuth);

router.route('/products')
  .get(getAllProducts)
  .post(createProduct);

router.route('/products/:id')
  .put(updateProduct)
  .delete(deleteProduct);

export default router;