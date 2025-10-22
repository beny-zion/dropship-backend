import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  image: String,
  asin: String
}, { _id: false });

const shippingAddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'נא להזין שם מלא']
  },
  phone: {
    type: String,
    required: [true, 'נא להזין מספר טלפון']
  },
  email: {
    type: String,
    required: [true, 'נא להזין אימייל']
  },
  street: {
    type: String,
    required: [true, 'נא להזין רחוב']
  },
  city: {
    type: String,
    required: [true, 'נא להזין עיר']
  },
  zipCode: {
    type: String,
    required: [true, 'נא להזין מיקוד']
  },
  apartment: String,
  floor: String,
  entrance: String,
  notes: String
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  items: [orderItemSchema],
  
  shippingAddress: {
    type: shippingAddressSchema,
    required: true
  },
  
  pricing: {
    subtotal: {
      type: Number,
      required: true
    },
    tax: {
      type: Number,
      required: true
    },
    shipping: {
      type: Number,
      required: true
    },
    total: {
      type: Number,
      required: true
    }
  },
  
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  
  payment: {
    method: {
      type: String,
      enum: ['credit_card', 'paypal', 'cash'],
      default: 'credit_card'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },
    transactionId: String,
    paidAt: Date
  },
  
  shipping: {
    method: {
      type: String,
      enum: ['standard', 'express'],
      default: 'standard'
    },
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,
    shippedAt: Date,
    deliveredAt: Date
  },
  
  notes: String,
  
  timeline: [{
    status: String,
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Add initial timeline entry
orderSchema.pre('save', function(next) {
  if (this.isNew) {
    this.timeline.push({
      status: 'pending',
      message: 'ההזמנה התקבלה'
    });
  }
  this.updatedAt = Date.now();
  next();
});

// Update user stats when order is created
orderSchema.post('save', async function(doc) {
  if (doc.isNew && doc.payment.status === 'completed') {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(doc.user, {
      $inc: {
        'stats.totalOrders': 1,
        'stats.totalSpent': doc.pricing.total
      }
    });
  }
});

const Order = mongoose.model('Order', orderSchema);

export default Order;