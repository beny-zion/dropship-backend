import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variantSku: {
    type: String,
    trim: true,
    uppercase: true,
    default: null // null = מוצר ללא ווריאנט
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'כמות חייבת להיות לפחות 1'],
    max: [10, 'כמות מקסימלית היא 10']
  },
  // אין שדה price - תמיד נקרא מה-DB!
}, { _id: false });

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  
  // ⭐ אין שדות totals - נחשב בזמן אמת!
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
cartSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// ⚡ Index for fast user cart lookup
cartSchema.index({ user: 1 });

const Cart = mongoose.model('Cart', cartSchema);

export default Cart;