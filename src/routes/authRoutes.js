import express from 'express';
import { register, login, getMe, logout } from '../controllers/authController.js';
import { auth } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// 🔒 הגנה מפני Brute Force על login/register
router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);

// Protected routes
router.get('/me', auth, getMe);
router.post('/logout', auth, logout);

export default router;