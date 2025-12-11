/**
 * Public Settings Routes
 *
 * נתיבים פומביים להגדרות (ללא צורך באימות)
 */

import express from 'express';
import * as settingsController from '../controllers/settingsController.js';

const router = express.Router();

// @route   GET /api/settings/shipping
// @desc    Get shipping settings (public)
// @access  Public
router.get('/shipping', settingsController.getShippingSettings);

export default router;
