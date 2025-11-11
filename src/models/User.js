// models/User.js - Enhanced for Week 4

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'אימייל נדרש'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'אימייל לא תקין']
  },
  password: {
    type: String,
    required: function() {
      // Password required only for local auth (not for Google OAuth)
      return this.authProvider === 'local';
    },
    minlength: [6, 'סיסמה חייבת להכיל לפחות 6 תווים'],
    select: false
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows null values to be non-unique
  },
  firstName: {
    type: String,
    required: [true, 'שם פרטי נדרש'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'שם משפחה נדרש'],
    trim: true
  },
  phone: {
    type: String,
    required: false, // Phone is now optional - will be collected at checkout
    match: [/^05\d{8}$/, 'מספר טלפון לא תקין']
  },
  
  // ⭐ New fields for Week 4
  profileImage: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: [500, 'ביוגרפיה יכולה להכיל עד 500 תווים']
  },
  preferences: {
    language: {
      type: String,
      enum: ['he', 'en'],
      default: 'he'
    },
    currency: {
      type: String,
      enum: ['ILS', 'USD'],
      default: 'ILS'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    }
  },
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update last active
userSchema.methods.updateLastActive = function() {
  this.lastActive = Date.now();
  return this.save();
};

// Generate full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});


// יצירת JWT token
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

export default mongoose.model('User', userSchema);