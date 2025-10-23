// models/Address.js - Week 4

import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  fullName: {
    type: String,
    required: [true, 'שם מלא נדרש'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'טלפון נדרש'],
    match: [/^05\d{8}$/, 'מספר טלפון לא תקין']
  },
  street: {
    type: String,
    required: [true, 'רחוב נדרש']
  },
  apartment: {
    type: String,
    trim: true
  },
  floor: {
    type: String,
    trim: true
  },
  entrance: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    required: [true, 'עיר נדרשת']
  },
  zipCode: {
    type: String,
    required: [true, 'מיקוד נדרש'],
    match: [/^\d{7}$/, 'מיקוד חייב להיות 7 ספרות']
  },
  country: {
    type: String,
    default: 'ישראל'
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  label: {
    type: String,
    enum: ['home', 'work', 'other'],
    default: 'home'
  }
}, {
  timestamps: true
});

// Ensure only one default address per user
addressSchema.pre('save', async function(next) {
  if (this.isDefault) {
    await this.constructor.updateMany(
      { user: this.user, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

// If this is the first address, make it default
addressSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await this.constructor.countDocuments({ user: this.user });
    if (count === 0) {
      this.isDefault = true;
    }
  }
  next();
});

// Add index for faster queries
addressSchema.index({ user: 1, isDefault: 1 });

export default mongoose.model('Address', addressSchema);