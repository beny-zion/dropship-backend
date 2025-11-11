// routes/homePageRoutes.js

import express from 'express';
import { auth, adminAuth } from '../middleware/auth.js';
import { adminRateLimiter } from '../middleware/rateLimiter.js';
import { sanitizeInput, validateMongoId } from '../middleware/validators.js';
import { logAdminAction } from '../middleware/auditLogger.js';

import * as homePageController from '../controllers/homePageController.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================

/**
 * @route   GET /api/homepage
 * @desc    Get active homepage layout
 * @access  Public
 */
router.get('/', homePageController.getActiveHomePage);

/**
 * @route   GET /api/homepage/sections/:sectionId
 * @desc    Get specific section
 * @access  Public
 */
router.get('/sections/:sectionId', homePageController.getSection);

// ============================================
// ADMIN ROUTES (Protected)
// ============================================

// Apply middleware to all admin routes
router.use('/admin', auth, adminAuth, adminRateLimiter, sanitizeInput);

/**
 * @route   GET /api/homepage/admin
 * @desc    Get all homepage layouts
 * @access  Private/Admin
 */
router.get(
  '/admin',
  logAdminAction('VIEW_ALL_HOMEPAGES', 'HomePage'),
  homePageController.getAllHomePages
);

/**
 * @route   GET /api/homepage/admin/:id
 * @desc    Get homepage by ID
 * @access  Private/Admin
 */
router.get(
  '/admin/:id',
  validateMongoId,
  logAdminAction('VIEW_HOMEPAGE', 'HomePage'),
  homePageController.getHomePageById
);

/**
 * @route   POST /api/homepage/admin
 * @desc    Create new homepage
 * @access  Private/Admin
 */
router.post(
  '/admin',
  logAdminAction('CREATE_HOMEPAGE', 'HomePage'),
  homePageController.createHomePage
);

/**
 * @route   PUT /api/homepage/admin/:id
 * @desc    Update homepage
 * @access  Private/Admin
 */
router.put(
  '/admin/:id',
  validateMongoId,
  logAdminAction('UPDATE_HOMEPAGE', 'HomePage'),
  homePageController.updateHomePage
);

/**
 * @route   DELETE /api/homepage/admin/:id
 * @desc    Delete homepage
 * @access  Private/Admin
 */
router.delete(
  '/admin/:id',
  validateMongoId,
  logAdminAction('DELETE_HOMEPAGE', 'HomePage'),
  homePageController.deleteHomePage
);

/**
 * @route   PATCH /api/homepage/admin/:id/toggle
 * @desc    Toggle homepage active status
 * @access  Private/Admin
 */
router.patch(
  '/admin/:id/toggle',
  validateMongoId,
  logAdminAction('TOGGLE_HOMEPAGE', 'HomePage'),
  homePageController.toggleHomePageStatus
);

/**
 * @route   POST /api/homepage/admin/:id/clone
 * @desc    Clone homepage
 * @access  Private/Admin
 */
router.post(
  '/admin/:id/clone',
  validateMongoId,
  logAdminAction('CLONE_HOMEPAGE', 'HomePage'),
  homePageController.cloneHomePage
);

/**
 * @route   GET /api/homepage/admin/:id/stats
 * @desc    Get homepage statistics
 * @access  Private/Admin
 */
router.get(
  '/admin/:id/stats',
  validateMongoId,
  homePageController.getHomePageStats
);

// ============================================
// SECTIONS MANAGEMENT
// ============================================

/**
 * @route   POST /api/homepage/admin/:id/sections
 * @desc    Add section to homepage
 * @access  Private/Admin
 */
router.post(
  '/admin/:id/sections',
  validateMongoId,
  logAdminAction('ADD_SECTION', 'HomePage'),
  homePageController.addSection
);

/**
 * @route   PUT /api/homepage/admin/:id/sections/reorder
 * @desc    Reorder sections
 * @access  Private/Admin
 * @note    MUST be before /:sectionId route to avoid route conflict
 */
router.put(
  '/admin/:id/sections/reorder',
  validateMongoId,
  logAdminAction('REORDER_SECTIONS', 'HomePage'),
  homePageController.reorderSections
);

/**
 * @route   PUT /api/homepage/admin/:id/sections/:sectionId
 * @desc    Update section
 * @access  Private/Admin
 */
router.put(
  '/admin/:id/sections/:sectionId',
  validateMongoId,
  logAdminAction('UPDATE_SECTION', 'HomePage'),
  homePageController.updateSection
);

/**
 * @route   DELETE /api/homepage/admin/:id/sections/:sectionId
 * @desc    Delete section
 * @access  Private/Admin
 */
router.delete(
  '/admin/:id/sections/:sectionId',
  validateMongoId,
  logAdminAction('DELETE_SECTION', 'HomePage'),
  homePageController.deleteSection
);

/**
 * @route   PATCH /api/homepage/admin/:id/sections/:sectionId/toggle
 * @desc    Toggle section visibility
 * @access  Private/Admin
 */
router.patch(
  '/admin/:id/sections/:sectionId/toggle',
  validateMongoId,
  logAdminAction('TOGGLE_SECTION', 'HomePage'),
  homePageController.toggleSectionVisibility
);

export default router;
