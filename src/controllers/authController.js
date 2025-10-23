import User from '../models/User.js';
import tokenBlacklist from '../utils/tokenBlacklist.js';
import jwt from 'jsonwebtoken';

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // בדיקה אם המשתמש כבר קיים
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'משתמש עם אימייל זה כבר קיים'
      });
    }

    // יצירת משתמש חדש
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phone
    });

    // יצירת token
    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      message: 'משתמש נוצר בהצלחה',
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה ביצירת משתמש',
      error: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // בדיקת קלט
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'נא להזין אימייל וסיסמה'
      });
    }

    // מציאת משתמש (כולל password)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'אימייל או סיסמה שגויים'
      });
    }

    // בדיקת סיסמה
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'אימייל או סיסמה שגויים'
      });
    }

    // עדכון lastLogin
    user.lastLogin = Date.now();
    await user.save();

    // יצירת token
    const token = user.generateAuthToken();

    res.json({
      success: true,
      message: 'התחברת בהצלחה',
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בהתחברות',
      error: error.message
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        stats: user.stats,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בקבלת נתוני משתמש'
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res) => {
  try {
    // לוקח את ה-token שנשמר ב-auth middleware
    const token = req.token;

    if (token) {
      // מחשב את זמן פקיעת הטוקן
      const decoded = jwt.decode(token);
      const expiryTime = decoded.exp * 1000; // המר לmilliseconds

      // מוסיף את הטוקן לרשימה השחורה
      tokenBlacklist.add(token, expiryTime);
    }

    res.json({
      success: true,
      message: 'התנתקת בהצלחה'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בהתנתקות'
    });
  }
};