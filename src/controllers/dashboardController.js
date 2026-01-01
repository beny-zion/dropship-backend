// controllers/dashboardController.js - Week 5: Admin Dashboard API

import Product from '../models/Product.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard/stats
// @access  Private/Admin
export const getDashboardStats = asyncHandler(async (req, res) => {
  // Parallel queries for better performance
  const [
    totalProducts,
    activeProducts,
    totalOrders,
    totalUsers,
    pendingOrders,
    completedOrders,
    totalRevenue,
    lowStockProducts
  ] = await Promise.all([
    // Products stats
    Product.countDocuments(),
    Product.countDocuments({ status: 'active', 'stock.available': true }),
    
    // Orders stats
    Order.countDocuments(),
    
    // Users stats
    User.countDocuments({ role: 'user', accountStatus: 'active' }),
    
    // Pending orders - use computed.overallProgress
    Order.countDocuments({
      'computed.overallProgress': 'pending'
    }),

    // Completed orders - use computed.overallProgress
    Order.countDocuments({ 'computed.overallProgress': 'completed' }),

    // Total revenue from charged orders
    Order.aggregate([
      {
        $match: {
          'payment.status': 'charged'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$payment.chargedAmount', '$pricing.adjustedTotal'] } }
        }
      }
    ]),
    
    // Low stock products (less than 10)
    Product.countDocuments({ 
      'stock.quantity': { $lt: 10 },
      'stock.available': true 
    })
  ]);

  // Calculate growth (last 30 days vs previous 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [lastMonthOrders, previousMonthOrders] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Order.countDocuments({ 
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } 
    })
  ]);

  // Calculate growth percentage
  const ordersGrowth = previousMonthOrders > 0
    ? ((lastMonthOrders - previousMonthOrders) / previousMonthOrders * 100).toFixed(1)
    : 0;

  res.json({
    success: true,
    data: {
      overview: {
        totalProducts,
        activeProducts,
        totalOrders,
        totalUsers,
        pendingOrders,
        completedOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        lowStockProducts
      },
      growth: {
        orders: {
          current: lastMonthOrders,
          previous: previousMonthOrders,
          percentage: parseFloat(ordersGrowth)
        }
      },
      alerts: {
        lowStock: lowStockProducts > 0,
        pendingOrders: pendingOrders > 0
      }
    }
  });
});

// @desc    Get recent orders (last 10)
// @route   GET /api/admin/dashboard/recent-orders
// @access  Private/Admin
export const getRecentOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .populate('user', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('orderNumber status pricing.total createdAt user')
    .lean();

  // Convert IDs to strings
  const ordersWithStringIds = orders.map(order => ({
    ...order,
    _id: order._id.toString(),
    user: order.user ? {
      ...order.user,
      _id: order.user._id.toString()
    } : null
  }));

  res.json({
    success: true,
    data: ordersWithStringIds
  });
});

// @desc    Get top selling products (last 30 days)
// @route   GET /api/admin/dashboard/top-products
// @access  Private/Admin
export const getTopProducts = asyncHandler(async (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Aggregate orders to get top products
  const topProducts = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
        'payment.status': 'charged'
      }
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        totalSold: { $sum: '$items.quantity' },
        totalRevenue: { 
          $sum: { $multiply: ['$items.quantity', '$items.price'] } 
        }
      }
    },
    { $sort: { totalSold: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'productDetails'
      }
    },
    { $unwind: '$productDetails' },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: '$productDetails.name_he',
        image: { $arrayElemAt: ['$productDetails.images.url', 0] },
        totalSold: 1,
        totalRevenue: 1
      }
    }
  ]);

  res.json({
    success: true,
    data: topProducts
  });
});

// @desc    Get sales chart data (last 7 or 30 days)
// @route   GET /api/admin/dashboard/sales-chart?period=7
// @access  Private/Admin
export const getSalesChartData = asyncHandler(async (req, res) => {
  const period = parseInt(req.query.period) || 7; // default 7 days
  const validPeriods = [7, 30];
  
  if (!validPeriods.includes(period)) {
    return res.status(400).json({
      success: false,
      message: 'תקופה לא תקינה. השתמש ב-7 או 30 ימים'
    });
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  startDate.setHours(0, 0, 0, 0);

  // Aggregate sales by day
  const salesData = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        'payment.status': 'charged'
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        totalSales: { $sum: '$pricing.total' },
        orderCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        date: '$_id',
        sales: '$totalSales',
        orders: '$orderCount'
      }
    }
  ]);

  // Fill missing dates with 0
  const filledData = [];
  const currentDate = new Date(startDate);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  while (currentDate <= today) {
    const dateString = currentDate.toISOString().split('T')[0];
    const existingData = salesData.find(d => d.date === dateString);
    
    filledData.push({
      date: dateString,
      sales: existingData?.sales || 0,
      orders: existingData?.orders || 0
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }

  res.json({
    success: true,
    data: filledData
  });
});

// @desc    Get revenue by category
// @route   GET /api/admin/dashboard/revenue-by-category
// @access  Private/Admin
export const getRevenueByCategory = asyncHandler(async (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const categoryRevenue = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
        'payment.status': 'charged'
      }
    },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product.category',
        revenue: { 
          $sum: { $multiply: ['$items.quantity', '$items.price'] } 
        },
        orders: { $sum: 1 }
      }
    },
    { $sort: { revenue: -1 } },
    {
      $project: {
        _id: 0,
        category: '$_id',
        revenue: 1,
        orders: 1
      }
    }
  ]);

  res.json({
    success: true,
    data: categoryRevenue
  });
});

// @desc    Get user growth chart (last 30 days)
// @route   GET /api/admin/dashboard/user-growth
// @access  Private/Admin
export const getUserGrowthData = asyncHandler(async (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const userGrowth = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
        role: 'user'
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        date: '$_id',
        newUsers: '$count'
      }
    }
  ]);

  res.json({
    success: true,
    data: userGrowth
  });
});

export default {
  getDashboardStats,
  getRecentOrders,
  getTopProducts,
  getSalesChartData,
  getRevenueByCategory,
  getUserGrowthData
};
