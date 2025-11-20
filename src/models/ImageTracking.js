import mongoose from 'mongoose';

const imageTrackingSchema = new mongoose.Schema({
  // מזהה ייחודי של התמונה ב-Cloudinary
  publicId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // URL מלא של התמונה
  url: {
    type: String,
    required: true
  },

  // מידע על גודל ופורמט
  size: {
    type: Number,  // bytes
    required: true
  },

  format: {
    type: String,  // jpg, png, webp, etc.
    required: true
  },

  // מטא-דאטה של Cloudinary
  cloudinaryMetadata: {
    width: Number,
    height: Number,
    resourceType: {
      type: String,
      enum: ['image', 'video', 'raw'],
      default: 'image'
    },
    bytes: Number,
    createdAt: Date
  },

  // מידע על שימוש - איפה התמונה בשימוש
  usedIn: [{
    type: {
      type: String,
      enum: ['product', 'category', 'homepage', 'other'],
      required: true
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'usedIn.type'
    },
    fieldPath: String  // 'images.0', 'variants.0.images.1', etc.
  }],

  // סטטוס התמונה
  status: {
    type: String,
    enum: ['active', 'unused', 'orphaned', 'deleted'],
    default: 'active',
    index: true
  },

  // מי העלה
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  uploadedAt: {
    type: Date,
    default: Date.now
  },

  // מעקב
  lastChecked: Date,

  // הערות
  notes: String

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual: האם בשימוש
imageTrackingSchema.virtual('isUsed').get(function() {
  return this.usedIn && this.usedIn.length > 0;
});

// Index מורכב לחיפוש מהיר
imageTrackingSchema.index({ status: 1, uploadedAt: -1 });
imageTrackingSchema.index({ 'usedIn.type': 1, 'usedIn.referenceId': 1 });

const ImageTracking = mongoose.model('ImageTracking', imageTrackingSchema);

export default ImageTracking;
