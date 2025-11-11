// controllers/userController.js - Week 4

import User from '../models/User.js';
import Order from '../models/Order.js';

// @desc    Get user profile with stats
// @route   GET /api/users/profile
// @access  Private
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'משתמש לא נמצא'
      });
    }

    // Get user stats
    const totalOrders = await Order.countDocuments({ user: user._id });
    
    const totalSpentResult = await Order.aggregate([
      { $match: { user: user._id, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    // Convert user to plain object with proper date serialization
    const userObj = user.toObject({ flattenMaps: true });

    res.json({
      success: true,
      data: {
        user: {
          ...userObj,
          createdAt: user.createdAt?.toISOString(),
          updatedAt: user.updatedAt?.toISOString(),
          lastActive: user.lastActive?.toISOString()
        },
        stats: {
          totalOrders,
          totalSpent: totalSpentResult[0]?.total || 0
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת הפרופיל'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = async (req, res) => {
  try {
    const allowedUpdates = ['firstName', 'lastName', 'phone', 'bio', 'profileImage', 'preferences'];
    const updates = {};

    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    // Validate phone if provided
    if (updates.phone && !/^05\d{8}$/.test(updates.phone)) {
      return res.status(400).json({
        success: false,
        message: 'מספר טלפון לא תקין'
      });
    }

    // Validate bio length if provided
    if (updates.bio && updates.bio.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'ביוגרפיה יכולה להכיל עד 500 תווים'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      {
        new: true,
        runValidators: true
      }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'משתמש לא נמצא'
      });
    }

    res.json({
      success: true,
      data: user,
      message: 'הפרופיל עודכן בהצלחה'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון הפרופיל'
    });
  }
};

// @desc    Change password
// @route   PUT /api/users/change-password
// @access  Private
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'נא למלא את כל השדות'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'סיסמה חדשה חייבת להכיל לפחות 6 תווים'
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'משתמש לא נמצא'
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'סיסמה נוכחית שגויה'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'הסיסמה שונתה בהצלחה'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בשינוי סיסמה'
    });
  }
};

// @desc    Delete account (soft delete)
// @route   DELETE /api/users/account
// @access  Private
export const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'נא להזין סיסמה לאישור'
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'משתמש לא נמצא'
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'סיסמה שגויה'
      });
    }

    // Soft delete
    user.accountStatus = 'deleted';
    await user.save();

    res.json({
      success: true,
      message: 'החשבון נמחק בהצלחה'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה במחיקת חשבון'
    });
  }
};

// @desc    Update user preferences
// @route   PUT /api/users/preferences
// @access  Private
export const updatePreferences = async (req, res) => {
  try {
    const { language, currency, notifications } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'משתמש לא נמצא'
      });
    }

    // Update preferences
    if (language) user.preferences.language = language;
    if (currency) user.preferences.currency = currency;
    if (notifications) {
      user.preferences.notifications = {
        ...user.preferences.notifications,
        ...notifications
      };
    }

    await user.save();

    res.json({
      success: true,
      data: user.preferences,
      message: 'ההעדפות עודכנו בהצלחה'
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון העדפות'
    });
  }
};