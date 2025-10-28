import express from 'express';
import {
  uploadProductImage,
  deleteProductImage,
  validateImageURL,
  uploadMultipleImages
} from '../controllers/uploadController.js';
import { auth, adminAuth } from '../middleware/auth.js';
import {adminRateLimiter}   from '../middleware/rateLimiter.js';

const router = express.Router();

// כל הנתיבים דורשים אימות מנהל
router.use(auth, adminAuth, adminRateLimiter);

/**
 * @route   POST /api/upload/image
 * @desc    העלאת תמונה בודדת ל-Cloudinary
 * @access  Admin
 */
router.post('/image', uploadProductImage);

/**
 * @route   POST /api/upload/images
 * @desc    העלאת מספר תמונות בבת אחת
 * @access  Admin
 */
router.post('/images', uploadMultipleImages);

/**
 * @route   DELETE /api/upload/image/:publicId
 * @desc    מחיקת תמונה מ-Cloudinary
 * @access  Admin
 */
router.delete('/image/:publicId', deleteProductImage);

/**
 * @route   POST /api/upload/validate-url
 * @desc    אימות URL של תמונה חיצונית
 * @access  Admin
 */
router.post('/validate-url', validateImageURL);

export default router;
