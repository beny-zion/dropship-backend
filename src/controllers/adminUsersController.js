// controllers/adminUsersController.js - Week 5: Users Management for Admin

import User from '../models/User.js';
import Order from '../models/Order.js';
import asyncHandler from '../utils/asyncHandler.js';

// @desc    Get all users with pagination and filters
// @route   GET /api/admin/users
// @access  Private/Admin
export const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Build filter object
  const filter = {};

  // Filter by role
  if (req.query.role) {
    // Only add role filter if specific role is requested
    filter.role = req.query.role;
  }
  // If no role filter specified, show all users (both 'user' and 'admin')

  // Filter by account status (support both 'status' and 'accountStatus' params)
  if (req.query.accountStatus || req.query.status) {
    filter.accountStatus = req.query.accountStatus || req.query.status;
  }

  // Search by name or email
  if (req.query.search) {
    filter.$or = [
      { firstName: { $regex: req.query.search, $options: 'i' } },
      { lastName: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  // Filter by registration date
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) {
      filter.createdAt.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      const endDate = new Date(req.query.endDate);
      endDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = endDate;
    }
  }

  // Build sort object
  const sortBy = req.query.sortBy || '-createdAt';

  // Execute queries in parallel
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .select('-password -__v'),
    User.countDocuments(filter)
  ]);

  // Get order counts for each user
  const usersWithStats = await Promise.all(
    users.map(async (user) => {
      const orderCount = await Order.countDocuments({ user: user._id });
      const totalSpent = await Order.aggregate([
        {
          $match: {
            user: user._id,
            'payment.status': 'completed'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$pricing.total' }
          }
        }
      ]);

      return {
        ...user.toObject(),
        stats: {
          totalOrders: orderCount,
          totalSpent: totalSpent[0]?.total || 0
        }
      };
    })
  );

  res.json({
    success: true,
    data: usersWithStats,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalUsers: total,
      hasMore: skip + users.length < total
    }
  });
});

// @desc    Get single user details with full info
// @route   GET /api/admin/users/:id
// @access  Private/Admin
export const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'משתמש לא נמצא'
    });
  }

  // Get user's order statistics
  const [
    totalOrders,
    completedOrders,
    cancelledOrders,
    totalSpent,
    recentOrders
  ] = await Promise.all([
    Order.countDocuments({ user: user._id }),
    Order.countDocuments({ 
      user: user._id, 
      status: 'delivered' 
    }),
    Order.countDocuments({ 
      user: user._id, 
      status: 'cancelled' 
    }),
    Order.aggregate([
      {
        $match: {
          user: user._id,
          'payment.status': 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.total' }
        }
      }
    ]),
    Order.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderNumber status pricing.total createdAt')
  ]);

  res.json({
    success: true,
    data: {
      user,
      stats: {
        totalOrders,
        completedOrders,
        cancelledOrders,
        totalSpent: totalSpent[0]?.total || 0,
        averageOrderValue: totalOrders > 0 
          ? (totalSpent[0]?.total || 0) / totalOrders 
          : 0
      },
      recentOrders
    }
  });
});

// @desc    Get user's orders
// @route   GET /api/admin/users/:id/orders
// @access  Private/Admin
export const getUserOrders = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'משתמש לא נמצא'
    });
  }

  // Build filter
  const filter = { user: user._id };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Order.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: orders,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalOrders: total,
      hasMore: skip + orders.length < total
    }
  });
});

// @desc    Update user account status (suspend/activate)
// @route   PATCH /api/admin/users/:id/status
// @access  Private/Admin
export const updateUserStatus = asyncHandler(async (req, res) => {
  const { accountStatus, reason } = req.body;

  const validStatuses = ['active', 'suspended', 'deleted'];

  if (!validStatuses.includes(accountStatus)) {
    return res.status(400).json({
      success: false,
      message: 'סטטוס לא תקין'
    });
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'משתמש לא נמצא'
    });
  }

  // Can't change admin users
  if (user.role === 'admin') {
    return res.status(403).json({
      success: false,
      message: 'לא ניתן לשנות סטטוס של משתמש מנהל'
    });
  }

  user.accountStatus = accountStatus;
  await user.save();

  res.json({
    success: true,
    message: `חשבון המשתמש ${accountStatus === 'suspended' ? 'הושעה' : accountStatus === 'active' ? 'הופעל' : 'נמחק'}`,
    data: user
  });
});

// @desc    Get users statistics
// @route   GET /api/admin/users/stats
// @access  Private/Admin
export const getUsersStats = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalUsers,
    regularUsers,
    activeUsers,
    suspendedUsers,
    adminUsers,
    newUsersToday,
    newUsersThisMonth
  ] = await Promise.all([
    User.countDocuments(), // All users (both user and admin)
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ accountStatus: 'active' }), // All active users
    User.countDocuments({ accountStatus: 'suspended' }), // All suspended users
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({
      createdAt: { $gte: today }
    }),
    User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    })
  ]);

  res.json({
    success: true,
    data: {
      totalUsers, // Total of all users (user + admin)
      regularUsers, // Only 'user' role
      activeUsers, // All active
      suspendedUsers, // All suspended
      adminUsers, // Only 'admin' role
      newUsersToday,
      newUsersThisMonth
    }
  });
});

export default {
  getAllUsers,
  getUserById,
  getUserOrders,
  updateUserStatus,
  getUsersStats
};
