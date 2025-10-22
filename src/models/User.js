import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const addressSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['home', 'work', 'other'],
    default: 'home'
  },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  zipCode: { type: String, required: true },
  apartment: String,
  floor: String,
  entrance: String,
  notes: String,
  isDefault: { type: Boolean, default: false }
});

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'נא להזין אימייל'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'נא להזין אימייל תקין']
  },
  password: {
    type: String,
    required: [true, 'נא להזין סיסמה'],
    minlength: [6, 'סיסמה חייבת להיות לפחות 6 תווים'],
    select: false
  },
  firstName: {
    type: String,
    required: [true, 'נא להזין שם פרטי']
  },
  lastName: {
    type: String,
    required: [true, 'נא להזין שם משפחה']
  },
  phone: {
    type: String,
    required: [true, 'נא להזין מספר טלפון']
  },
  
  addresses: [addressSchema],
  
  preferences: {
    newsletter: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false }
  },
  
  stats: {
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 }
  },
  
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  lastLogin: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Hash password לפני שמירה
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// עדכון updatedAt
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// השוואת סיסמה
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// יצירת JWT token
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

const User = mongoose.model('User', userSchema);

export default User;