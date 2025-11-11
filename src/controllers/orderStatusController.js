// controllers/orderStatusController.js - Order Status Management

import OrderStatus from '../models/OrderStatus.js';
import asyncHandler from '../utils/asyncHandler.js';

// @desc    Get all order statuses
// @route   GET /api/order-statuses
// @access  Public
export const getAllStatuses = asyncHandler(async (req, res) => {
  const statuses = await OrderStatus.find({ isActive: true })
    .sort({ order: 1 })
    .select('-__v');

  res.json({
    success: true,
    data: statuses
  });
});

// @desc    Get all order statuses (Admin - including inactive)
// @route   GET /api/admin/order-statuses
// @access  Private/Admin
export const getAllStatusesAdmin = asyncHandler(async (req, res) => {
  const statuses = await OrderStatus.find()
    .sort({ order: 1 })
    .select('-__v');

  res.json({
    success: true,
    data: statuses
  });
});

// @desc    Create new order status
// @route   POST /api/admin/order-statuses
// @access  Private/Admin
export const createStatus = asyncHandler(async (req, res) => {
  const {
    key,
    label_he,
    label_en,
    description,
    color,
    bgColor,
    textColor,
    order
  } = req.body;

  // Check if status with this key already exists
  const existingStatus = await OrderStatus.findOne({ key });
  if (existingStatus) {
    return res.status(400).json({
      success: false,
      message: 'סטטוס עם מפתח זה כבר קיים'
    });
  }

  const status = await OrderStatus.create({
    key,
    label_he,
    label_en,
    description,
    color,
    bgColor,
    textColor,
    order,
    isSystem: false
  });

  res.status(201).json({
    success: true,
    message: 'הסטטוס נוצר בהצלחה',
    data: status
  });
});

// @desc    Update order status
// @route   PUT /api/admin/order-statuses/:id
// @access  Private/Admin
export const updateStatus = asyncHandler(async (req, res) => {
  const status = await OrderStatus.findById(req.params.id);

  if (!status) {
    return res.status(404).json({
      success: false,
      message: 'הסטטוס לא נמצא'
    });
  }

  // Don't allow changing key for system statuses
  if (status.isSystem && req.body.key && req.body.key !== status.key) {
    return res.status(400).json({
      success: false,
      message: 'לא ניתן לשנות מפתח של סטטוס מערכת'
    });
  }

  const {
    key,
    label_he,
    label_en,
    description,
    color,
    bgColor,
    textColor,
    order,
    isActive
  } = req.body;

  if (key) status.key = key;
  if (label_he) status.label_he = label_he;
  if (label_en !== undefined) status.label_en = label_en;
  if (description !== undefined) status.description = description;
  if (color) status.color = color;
  if (bgColor) status.bgColor = bgColor;
  if (textColor) status.textColor = textColor;
  if (order !== undefined) status.order = order;
  if (isActive !== undefined) status.isActive = isActive;

  await status.save();

  res.json({
    success: true,
    message: 'הסטטוס עודכן בהצלחה',
    data: status
  });
});

// @desc    Delete order status
// @route   DELETE /api/admin/order-statuses/:id
// @access  Private/Admin
export const deleteStatus = asyncHandler(async (req, res) => {
  const status = await OrderStatus.findById(req.params.id);

  if (!status) {
    return res.status(404).json({
      success: false,
      message: 'הסטטוס לא נמצא'
    });
  }

  // Don't allow deleting system statuses
  if (status.isSystem) {
    return res.status(400).json({
      success: false,
      message: 'לא ניתן למחוק סטטוס מערכת'
    });
  }

  await status.deleteOne();

  res.json({
    success: true,
    message: 'הסטטוס נמחק בהצלחה'
  });
});

// @desc    Reorder statuses
// @route   PUT /api/admin/order-statuses/reorder
// @access  Private/Admin
export const reorderStatuses = asyncHandler(async (req, res) => {
  const { statuses } = req.body; // Array of { id, order }

  if (!Array.isArray(statuses)) {
    return res.status(400).json({
      success: false,
      message: 'נתונים לא תקינים'
    });
  }

  // Update all statuses
  await Promise.all(
    statuses.map(({ id, order }) =>
      OrderStatus.findByIdAndUpdate(id, { order })
    )
  );

  res.json({
    success: true,
    message: 'הסדר עודכן בהצלחה'
  });
});

export default {
  getAllStatuses,
  getAllStatusesAdmin,
  createStatus,
  updateStatus,
  deleteStatus,
  reorderStatuses
};
