// models/OrderStatus.js - Order Status Management Model

import mongoose from 'mongoose';

const orderStatusSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },

  label_he: {
    type: String,
    required: true,
    trim: true
  },

  label_en: {
    type: String,
    trim: true
  },

  description: {
    type: String,
    trim: true
  },

  color: {
    type: String,
    required: true,
    default: 'gray'
  },

  bgColor: {
    type: String,
    required: true,
    default: 'bg-gray-100'
  },

  textColor: {
    type: String,
    required: true,
    default: 'text-gray-800'
  },

  order: {
    type: Number,
    required: true,
    default: 0
  },

  isActive: {
    type: Boolean,
    default: true
  },

  isSystem: {
    type: Boolean,
    default: false // סטטוסי מערכת לא ניתנים למחיקה
  },

  autoTransitions: [{
    toStatus: String,
    condition: String // 'tracking_added', 'payment_completed', etc.
  }]
}, {
  timestamps: true
});

// Index for faster queries
orderStatusSchema.index({ order: 1, isActive: 1 });
orderStatusSchema.index({ key: 1 });

const OrderStatus = mongoose.model('OrderStatus', orderStatusSchema);

export default OrderStatus;
