/**
 * Admin Settings Controller
 *
 * ניהול הגדרות מערכת גלובליות
 */

import SystemSettings from '../models/SystemSettings.js';
import AuditLog from '../models/AuditLog.js';

/**
 * קבלת הגדרות מערכת
 * GET /api/admin/settings
 */
export const getSystemSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();

    // רשום גישה להגדרות
    await AuditLog.logAction({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'VIEW_SETTINGS',
      targetType: 'SystemSettings',
      status: 'success',
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בקבלת הגדרות מערכת',
      error: error.message
    });
  }
};

/**
 * עדכון הגדרות מערכת
 * PUT /api/admin/settings
 */
export const updateSystemSettings = async (req, res) => {
  try {
    const updates = req.body;

    // ולידציה בסיסית
    if (updates.shipping?.flatRate) {
      if (updates.shipping.flatRate.usd !== undefined && updates.shipping.flatRate.usd < 0) {
        return res.status(400).json({
          success: false,
          message: 'עלות משלוח ב-USD לא יכולה להיות שלילית'
        });
      }
      if (updates.shipping.flatRate.ils !== undefined && updates.shipping.flatRate.ils < 0) {
        return res.status(400).json({
          success: false,
          message: 'עלות משלוח ב-ILS לא יכולה להיות שלילית'
        });
      }
    }

    if (updates.order?.minimumAmount) {
      if (updates.order.minimumAmount.usd !== undefined && updates.order.minimumAmount.usd < 0) {
        return res.status(400).json({
          success: false,
          message: 'סכום הזמנה מינימלי ב-USD לא יכול להיות שלילי'
        });
      }
      if (updates.order.minimumAmount.ils !== undefined && updates.order.minimumAmount.ils < 0) {
        return res.status(400).json({
          success: false,
          message: 'סכום הזמנה מינימלי ב-ILS לא יכול להיות שלילי'
        });
      }
    }

    // עדכן הגדרות
    const updatedSettings = await SystemSettings.updateSettings(updates, req.user._id);

    // רשום פעולה
    await AuditLog.logAction({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'UPDATE_SETTINGS',
      targetType: 'SystemSettings',
      status: 'success',
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        updates: JSON.stringify(updates)
      }
    });

    res.json({
      success: true,
      message: 'הגדרות המערכת עודכנו בהצלחה',
      data: updatedSettings
    });
  } catch (error) {
    console.error('Update settings error:', error);

    // רשום כישלון
    await AuditLog.logAction({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'UPDATE_SETTINGS',
      targetType: 'SystemSettings',
      status: 'failure',
      errorMessage: error.message,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון הגדרות מערכת',
      error: error.message
    });
  }
};

/**
 * קבלת עלות משלוח נוכחית
 * GET /api/admin/settings/shipping-rate
 */
export const getShippingRate = async (req, res) => {
  try {
    const { currency = 'USD' } = req.query;
    const settings = await SystemSettings.getSettings();

    const rate = settings.getShippingRate(currency);

    res.json({
      success: true,
      data: {
        currency: currency.toUpperCase(),
        rate,
        estimatedDays: settings.shipping.estimatedDays
      }
    });
  } catch (error) {
    console.error('Get shipping rate error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בקבלת עלות משלוח',
      error: error.message
    });
  }
};

/**
 * איפוס הגדרות לדיפולט
 * POST /api/admin/settings/reset
 */
export const resetSystemSettings = async (req, res) => {
  try {
    // מחק הגדרות קיימות
    await SystemSettings.findByIdAndDelete('system-settings');

    // צור הגדרות חדשות עם ערכי דיפולט
    const newSettings = await SystemSettings.getSettings();

    // רשום פעולה
    await AuditLog.logAction({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'RESET_SETTINGS',
      targetType: 'SystemSettings',
      status: 'success',
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      message: 'הגדרות המערכת אופסו לברירת מחדל',
      data: newSettings
    });
  } catch (error) {
    console.error('Reset settings error:', error);

    // רשום כישלון
    await AuditLog.logAction({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'RESET_SETTINGS',
      targetType: 'SystemSettings',
      status: 'failure',
      errorMessage: error.message,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.status(500).json({
      success: false,
      message: 'שגיאה באיפוס הגדרות מערכת',
      error: error.message
    });
  }
};

export default {
  getSystemSettings,
  updateSystemSettings,
  getShippingRate,
  resetSystemSettings
};
