/**
 * Payment Routes
 *
 * מסלולים לניהול תשלומים
 */

import express from 'express';
import {
  holdPayment,
  capturePaymentManual,
  cancelPayment,
  getPaymentStatus,
  triggerChargeJob
} from '../controllers/paymentController.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/payments/hold
 * @desc    תפיסת מסגרת אשראי
 * @access  Private
 */
router.post('/hold', authenticate, holdPayment);

/**
 * @route   POST /api/payments/capture/:orderId
 * @desc    גביה ידנית (מנהל)
 * @access  Admin
 */
router.post('/capture/:orderId', authenticate, requireAdmin, capturePaymentManual);

/**
 * @route   POST /api/payments/cancel/:orderId
 * @desc    ביטול עסקה (מנהל)
 * @access  Admin
 */
router.post('/cancel/:orderId', authenticate, requireAdmin, cancelPayment);

/**
 * @route   GET /api/payments/status/:orderId
 * @desc    שאילתת סטטוס תשלום
 * @access  Private (משתמש או מנהל)
 */
router.get('/status/:orderId', authenticate, getPaymentStatus);

/**
 * @route   POST /api/payments/charge-ready
 * @desc    הרצה ידנית של Job לגביה (מנהל)
 * @access  Admin
 */
router.post('/charge-ready', authenticate, requireAdmin, triggerChargeJob);

/**
 * @route   POST /api/payments/notify
 * @desc    Webhook מ-Hyp Pay (IPN)
 * @access  Public
 * @note    יש לממש בשלבים הבאים
 */
router.post('/notify', (req, res) => {
  console.log('[PaymentRoutes] Hyp Pay Webhook received:', req.body);
  // TODO: לממש בשלב 4
  res.status(200).send('OK');
});

export default router;
