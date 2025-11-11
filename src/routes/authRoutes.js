import express from 'express';
import { register, login, getMe, logout } from '../controllers/authController.js';
import { googleAuth, googleCallback } from '../controllers/googleAuthController.js';
import { auth } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// 🔒 הגנה מפני Brute Force על login/register
router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);

// Google OAuth routes
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

// Protected routes
router.get('/me', auth, getMe);
router.post('/logout', auth, logout);

export default router;