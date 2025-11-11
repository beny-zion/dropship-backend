// routes/orderStatusRoutes.js - Order Status Routes

import express from 'express';
import {
  getAllStatuses,
  getAllStatusesAdmin,
  createStatus,
  updateStatus,
  deleteStatus,
  reorderStatuses
} from '../controllers/orderStatusController.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/', getAllStatuses);

// Admin routes
router.get('/admin', auth, adminAuth, getAllStatusesAdmin);
router.post('/admin', auth, adminAuth, createStatus);
router.put('/admin/reorder', auth, adminAuth, reorderStatuses);
router.put('/admin/:id', auth, adminAuth, updateStatus);
router.delete('/admin/:id', auth, adminAuth, deleteStatus);

export default router;
