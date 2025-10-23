import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import tokenBlacklist from '../utils/tokenBlacklist.js';

export const auth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'נא להתחבר תחילה'
      });
    }

    // 🔒 בדיקה אם ה-token ברשימה השחורה
    if (tokenBlacklist.has(token)) {
      return res.status(401).json({
        success: false,
        message: 'הטוקן בוטל, נא להתחבר מחדש'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'משתמש לא נמצא'
        });
      }

      // שמירת ה-token ב-req לשימוש עתידי (logout)
      req.token = token;
      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'טוקן לא תקין'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה באימות'
    });
  }
};

export const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'גישה למנהלים בלבד'
    });
  }
};