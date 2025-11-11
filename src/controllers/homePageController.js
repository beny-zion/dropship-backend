// controllers/homePageController.js

import HomePage from '../models/HomePage.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import asyncHandler from '../utils/asyncHandler.js';

// ============================================
// PUBLIC ENDPOINTS
// ============================================

/**
 * @desc    Get active homepage layout
 * @route   GET /api/homepage
 * @access  Public
 */
export const getActiveHomePage = asyncHandler(async (req, res) => {
  const { lang = 'he', preview = false } = req.query;

  // Get active homepage
  const homePage = await HomePage.getActiveHomePage(lang);

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  // Get active sections
  const sections = homePage.getActiveSections(lang);

  // Increment views (unless preview mode)
  if (!preview) {
    await homePage.incrementViews();
  }

  res.json({
    success: true,
    data: {
      ...homePage.toObject(),
      sections
    }
  });
});

/**
 * @desc    Get specific section by ID
 * @route   GET /api/homepage/sections/:sectionId
 * @access  Public
 */
export const getSection = asyncHandler(async (req, res) => {
  const { sectionId } = req.params;

  const homePage = await HomePage.getActiveHomePage();

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  const section = homePage.sections.id(sectionId);

  if (!section) {
    return res.status(404).json({
      success: false,
      message: 'סקשן לא נמצא'
    });
  }

  res.json({
    success: true,
    data: section
  });
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * @desc    Get all homepage layouts (including inactive)
 * @route   GET /api/homepage/admin
 * @access  Private/Admin
 */
export const getAllHomePages = asyncHandler(async (req, res) => {
  const homePages = await HomePage.find()
    .sort('-createdAt')
    .populate('createdBy', 'firstName lastName email')
    .populate('lastModifiedBy', 'firstName lastName email');

  res.json({
    success: true,
    count: homePages.length,
    data: homePages
  });
});

/**
 * @desc    Get homepage by ID (with full sections)
 * @route   GET /api/homepage/admin/:id
 * @access  Private/Admin
 */
export const getHomePageById = asyncHandler(async (req, res) => {
  const homePage = await HomePage.findById(req.params.id)
    .populate('sections.content.categoryGrid.categories')
    .populate('sections.content.productCarousel.products')
    .populate('sections.content.productCarousel.categoryFilter')
    .populate('createdBy', 'firstName lastName email')
    .populate('lastModifiedBy', 'firstName lastName email');

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  res.json({
    success: true,
    data: homePage
  });
});

/**
 * @desc    Create new homepage layout
 * @route   POST /api/homepage/admin
 * @access  Private/Admin
 */
export const createHomePage = asyncHandler(async (req, res) => {
  const homePageData = {
    ...req.body,
    createdBy: req.user._id,
    lastModifiedBy: req.user._id
  };

  const homePage = await HomePage.create(homePageData);

  res.status(201).json({
    success: true,
    message: 'דף בית נוצר בהצלחה',
    data: homePage
  });
});

/**
 * @desc    Update homepage layout
 * @route   PUT /api/homepage/admin/:id
 * @access  Private/Admin
 */
export const updateHomePage = asyncHandler(async (req, res) => {
  let homePage = await HomePage.findById(req.params.id);

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  // Extract only allowed fields for update
  const allowedFields = [
    'name',
    'isActive',
    'language',
    'sections',
    'seo',
    'globalStyling',
    'customCSS',
    'customJS'
  ];

  const updateData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  // Update lastModifiedBy
  updateData.lastModifiedBy = req.user._id;

  homePage = await HomePage.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: 'דף בית עודכן בהצלחה',
    data: homePage
  });
});

/**
 * @desc    Delete homepage layout
 * @route   DELETE /api/homepage/admin/:id
 * @access  Private/Admin
 */
export const deleteHomePage = asyncHandler(async (req, res) => {
  const homePage = await HomePage.findById(req.params.id);

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  // Don't allow deleting active homepage
  if (homePage.isActive) {
    return res.status(400).json({
      success: false,
      message: 'לא ניתן למחוק דף בית פעיל. בטל אותו תחילה.'
    });
  }

  await homePage.deleteOne();

  res.json({
    success: true,
    message: 'דף בית נמחק בהצלחה'
  });
});

/**
 * @desc    Toggle homepage active status
 * @route   PATCH /api/homepage/admin/:id/toggle
 * @access  Private/Admin
 */
export const toggleHomePageStatus = asyncHandler(async (req, res) => {
  const homePage = await HomePage.findById(req.params.id);

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  // If activating, deactivate all others with same language
  if (!homePage.isActive) {
    await HomePage.updateMany(
      { language: homePage.language, isActive: true },
      { isActive: false }
    );
  }

  homePage.isActive = !homePage.isActive;

  if (homePage.isActive) {
    homePage.publishedAt = new Date();
  }

  await homePage.save();

  res.json({
    success: true,
    message: `דף בית ${homePage.isActive ? 'הופעל' : 'בוטל'}`,
    data: homePage
  });
});

/**
 * @desc    Clone homepage for A/B testing
 * @route   POST /api/homepage/admin/:id/clone
 * @access  Private/Admin
 */
export const cloneHomePage = asyncHandler(async (req, res) => {
  const originalHomePage = await HomePage.findById(req.params.id);

  if (!originalHomePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  const { name } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'נא להזין שם לגרסה המשוכפלת'
    });
  }

  const clonedHomePage = originalHomePage.clone(name);
  clonedHomePage.createdBy = req.user._id;
  clonedHomePage.lastModifiedBy = req.user._id;

  await clonedHomePage.save();

  res.status(201).json({
    success: true,
    message: 'דף בית שוכפל בהצלחה',
    data: clonedHomePage
  });
});

// ============================================
// SECTIONS MANAGEMENT
// ============================================

/**
 * @desc    Add section to homepage
 * @route   POST /api/homepage/admin/:id/sections
 * @access  Private/Admin
 */
export const addSection = asyncHandler(async (req, res) => {
  const homePage = await HomePage.findById(req.params.id);

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  const sectionData = req.body;

  // Auto-assign display order if not provided
  if (!sectionData.displayOrder && sectionData.displayOrder !== 0) {
    sectionData.displayOrder = homePage.sections.length;
  }

  homePage.sections.push(sectionData);
  homePage.lastModifiedBy = req.user._id;

  await homePage.save();

  res.status(201).json({
    success: true,
    message: 'סקשן נוסף בהצלחה',
    data: homePage
  });
});

/**
 * @desc    Update section
 * @route   PUT /api/homepage/admin/:id/sections/:sectionId
 * @access  Private/Admin
 */
export const updateSection = asyncHandler(async (req, res) => {
  const { id, sectionId } = req.params;

  const homePage = await HomePage.findById(id);

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  const section = homePage.sections.id(sectionId);

  if (!section) {
    return res.status(404).json({
      success: false,
      message: 'סקשן לא נמצא'
    });
  }

  // Update section fields (exclude _id and other protected fields)
  const { _id, __v, ...updateData } = req.body;
  Object.assign(section, updateData);
  homePage.lastModifiedBy = req.user._id;

  await homePage.save();

  res.json({
    success: true,
    message: 'סקשן עודכן בהצלחה',
    data: homePage
  });
});

/**
 * @desc    Delete section
 * @route   DELETE /api/homepage/admin/:id/sections/:sectionId
 * @access  Private/Admin
 */
export const deleteSection = asyncHandler(async (req, res) => {
  const { id, sectionId } = req.params;

  const homePage = await HomePage.findById(id);

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  // Remove section using pull
  homePage.sections.pull(sectionId);
  homePage.lastModifiedBy = req.user._id;

  await homePage.save();

  res.json({
    success: true,
    message: 'סקשן נמחק בהצלחה',
    data: homePage
  });
});

/**
 * @desc    Reorder sections
 * @route   PUT /api/homepage/admin/:id/sections/reorder
 * @access  Private/Admin
 */
export const reorderSections = asyncHandler(async (req, res) => {
  const { sections } = req.body; // Array of { sectionId, displayOrder }

  console.log('🔄 Reorder Sections Request:');
  console.log('HomePage ID:', req.params.id);
  console.log('Sections to reorder:', JSON.stringify(sections, null, 2));

  if (!Array.isArray(sections)) {
    return res.status(400).json({
      success: false,
      message: 'נתונים לא תקינים'
    });
  }

  const homePage = await HomePage.findById(req.params.id);

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  console.log('Existing sections:', homePage.sections.map(s => ({ id: s._id.toString(), order: s.displayOrder })));

  // Update display order for each section
  let updatedCount = 0;
  sections.forEach(({ sectionId, displayOrder }) => {
    const section = homePage.sections.id(sectionId);
    if (section) {
      section.displayOrder = displayOrder;
      updatedCount++;
      console.log(`✅ Updated section ${sectionId} to order ${displayOrder}`);
    } else {
      console.log(`❌ Section ${sectionId} not found in homepage sections`);
    }
  });

  console.log(`Updated ${updatedCount} out of ${sections.length} sections`);

  homePage.lastModifiedBy = req.user._id;
  await homePage.save();

  res.json({
    success: true,
    message: 'סדר הסקשנים עודכן בהצלחה',
    data: homePage
  });
});

/**
 * @desc    Toggle section visibility
 * @route   PATCH /api/homepage/admin/:id/sections/:sectionId/toggle
 * @access  Private/Admin
 */
export const toggleSectionVisibility = asyncHandler(async (req, res) => {
  const { id, sectionId } = req.params;

  const homePage = await HomePage.findById(id);

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  const section = homePage.sections.id(sectionId);

  if (!section) {
    return res.status(404).json({
      success: false,
      message: 'סקשן לא נמצא'
    });
  }

  section.isActive = !section.isActive;
  homePage.lastModifiedBy = req.user._id;

  await homePage.save();

  res.json({
    success: true,
    message: `סקשן ${section.isActive ? 'הופעל' : 'בוטל'}`,
    data: homePage
  });
});

// ============================================
// STATISTICS
// ============================================

/**
 * @desc    Get homepage statistics
 * @route   GET /api/homepage/admin/:id/stats
 * @access  Private/Admin
 */
export const getHomePageStats = asyncHandler(async (req, res) => {
  const homePage = await HomePage.findById(req.params.id);

  if (!homePage) {
    return res.status(404).json({
      success: false,
      message: 'דף בית לא נמצא'
    });
  }

  // Calculate stats
  const stats = {
    totalViews: homePage.analytics.views,
    totalClicks: homePage.analytics.totalClicks,
    lastViewed: homePage.analytics.lastViewed,
    totalSections: homePage.sections.length,
    activeSections: homePage.sections.filter(s => s.isActive).length,
    sectionBreakdown: {}
  };

  // Count section types
  homePage.sections.forEach(section => {
    if (!stats.sectionBreakdown[section.type]) {
      stats.sectionBreakdown[section.type] = 0;
    }
    stats.sectionBreakdown[section.type]++;
  });

  res.json({
    success: true,
    data: stats
  });
});

export default {
  // Public
  getActiveHomePage,
  getSection,

  // Admin - HomePage Management
  getAllHomePages,
  getHomePageById,
  createHomePage,
  updateHomePage,
  deleteHomePage,
  toggleHomePageStatus,
  cloneHomePage,

  // Admin - Sections Management
  addSection,
  updateSection,
  deleteSection,
  reorderSections,
  toggleSectionVisibility,

  // Statistics
  getHomePageStats
};
