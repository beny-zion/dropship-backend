import mongoose from 'mongoose';
import OrderStatus from './OrderStatus.js';

const orderItemSchema = new mongoose.Schema({
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
  variantDetails: {
    color: String,
    size: String,
    sku: String
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
  asin: String,
  supplierLink: String, // קישור לרכישה אצל הספק
  supplierName: String // שם הספק (Amazon, Karl Lagerfeld, וכו')
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
    required: true,
    default: 'pending',
    validate: {
      validator: async function(value) {
        // Allow the default value 'pending' always
        if (value === 'pending') return true;

        // Check if status exists in OrderStatus collection
        const statusExists = await OrderStatus.findOne({
          key: value,
          isActive: true
        });
        return !!statusExists;
      },
      message: props => `סטטוס '${props.value}' לא קיים במערכת`
    }
  },

  creditHold: {
    amount: Number,           // סכום המסגרת הנעולה
    heldAt: Date,            // מתי נעל
    releasedAt: Date         // מתי שוחרר
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
      default: () => new Date()
    }
  }]
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      // Always use _id timestamp as fallback for all dates
      const fallbackDate = doc._id.getTimestamp().toISOString();

      // Fix createdAt
      if (doc.createdAt instanceof Date) {
        ret.createdAt = doc.createdAt.toISOString();
      } else {
        ret.createdAt = fallbackDate;
      }

      // Fix updatedAt
      if (doc.updatedAt instanceof Date) {
        ret.updatedAt = doc.updatedAt.toISOString();
      } else {
        ret.updatedAt = fallbackDate;
      }

      // Fix timeline timestamps
      if (ret.timeline && Array.isArray(ret.timeline)) {
        ret.timeline = ret.timeline.map((item, index) => {
          const docItem = doc.timeline && doc.timeline[index];
          if (docItem && docItem.timestamp instanceof Date) {
            item.timestamp = docItem.timestamp.toISOString();
          } else {
            item.timestamp = fallbackDate;
          }
          return item;
        });
      }

      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Add initial timeline entry
orderSchema.pre('save', function(next) {
  if (this.isNew) {
    this.timeline.push({
      status: 'pending',
      message: 'ההזמנה התקבלה',
      timestamp: new Date()
    });
  }
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