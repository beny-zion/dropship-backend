import express from 'express';
import {
  getMediaStats,
  getImages,
  syncImages,
  cleanupImages,
  initialSync
} from '../controllers/mediaController.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// כל הראוטים מוגנים - רק אדמין
router.use(auth);
router.use(adminAuth);

// GET /api/admin/media/stats
router.get('/stats', getMediaStats);

// GET /api/admin/media/images
router.get('/images', getImages);

// POST /api/admin/media/sync
router.post('/sync', syncImages);

// POST /api/admin/media/initial-sync
router.post('/initial-sync', initialSync);

// DELETE /api/admin/media/cleanup
router.delete('/cleanup', cleanupImages);

export default router;
