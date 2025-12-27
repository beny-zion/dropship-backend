/**
 * Payment Routes
 *
 * מסלולים לניהול תשלומים:
 * ✅ IFRAME Flow (New)
 * ❌ Old Flow (DEPRECATED)
 */

import express from 'express';
import {
  // ✅ IFRAME Flow
  createPaymentLink,
  callbackSuccess,
  callbackError,
  // Shared
  capturePaymentManual,
  cancelPayment,
  getPaymentStatus,
  triggerChargeJob,
  // ❌ DEPRECATED
  holdPayment
} from '../controllers/paymentController.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// ============================================================
// ✅ IFRAME Payment Flow (New & Recommended)
// ============================================================

/**
 * @route   POST /api/payments/create-payment-link
 * @desc    יצירת קישור תשלום (IFRAME)
 * @access  Private (משתמש מחובר)
 */
router.post('/create-payment-link', auth, createPaymentLink);

/**
 * @route   GET /api/payments/callback/success
 * @desc    Callback מ-HyPay - תשלום הצליח
 * @access  Public (HyPay מפנה לזה)
 */
router.get('/callback/success', callbackSuccess);

/**
 * @route   GET /api/payments/callback/error
 * @desc    Callback מ-HyPay - תשלום נכשל
 * @access  Public (HyPay מפנה לזה)
 */
router.get('/callback/error', callbackError);

// ============================================================
// ❌ Old Payment Flow (DEPRECATED)
// ============================================================

/**
 * @route   POST /api/payments/hold
 * @desc    תפיסת מסגרת אשראי
 * @access  Private
 */
router.post('/hold', auth, holdPayment);

/**
 * @route   POST /api/payments/capture/:orderId
 * @desc    גביה ידנית (מנהל)
 * @access  Admin
 */
router.post('/capture/:orderId', auth, adminAuth, capturePaymentManual);

/**
 * @route   POST /api/payments/cancel/:orderId
 * @desc    ביטול עסקה (מנהל)
 * @access  Admin
 */
router.post('/cancel/:orderId', auth, adminAuth, cancelPayment);

/**
 * @route   GET /api/payments/status/:orderId
 * @desc    שאילתת סטטוס תשלום
 * @access  Private (משתמש או מנהל)
 */
router.get('/status/:orderId', auth, getPaymentStatus);

/**
 * @route   POST /api/payments/charge-ready
 * @desc    הרצה ידנית של Job לגביה (מנהל)
 * @access  Admin
 */
router.post('/charge-ready', auth, adminAuth, triggerChargeJob);

/**
 * @route   POST /api/payments/notify
 * @desc    Webhook מ-Hyp Pay (IPN)
 * @access  Public
 * @note    יש לממש בשלבים הבאים
 */
router.post('/notify', (req, res) => {
  // ✅ Phase 6.5.4: לא לוגים של req.body המלא (יכול להכיל פרטי תשלום רגישים)
  console.log('[PaymentRoutes] Hyp Pay Webhook received - Order:', req.body?.Order || 'N/A', 'CCode:', req.body?.CCode);
  // TODO: לממש בשלב 4
  res.status(200).send('OK');
});

export default router;
