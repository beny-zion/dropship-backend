// routes/userRoutes.js - Week 4

import express from 'express';
import { auth } from '../middleware/auth.js';
import {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  updatePreferences
} from '../controllers/userController.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Profile routes
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

// Password management
router.put('/change-password', changePassword);

// Preferences
router.put('/preferences', updatePreferences);

// Account deletion
router.delete('/account', deleteAccount);

export default router;