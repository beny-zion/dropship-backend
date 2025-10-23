// routes/addressRoutes.js - Week 4

import express from 'express';
import { auth } from '../middleware/auth.js';
import {
  getAddresses,
  getAddress,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getDefaultAddress
} from '../controllers/addressController.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Get default address
router.get('/default', getDefaultAddress);

// CRUD operations
router.route('/')
  .get(getAddresses)
  .post(createAddress);

router.route('/:id')
  .get(getAddress)
  .put(updateAddress)
  .delete(deleteAddress);

// Set default address
router.put('/:id/default', setDefaultAddress);

export default router;