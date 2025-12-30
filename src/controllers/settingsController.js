/**
 * Public Settings Controller
 *
 * אנדפוינטים פומביים להגדרות (ללא צורך באימות)
 */

import SystemSettings from '../models/SystemSettings.js';

/**
 * קבלת הגדרות משלוח (פומבי)
 * GET /api/settings/shipping
 */
export const getShippingSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();

    res.json({
      success: true,
      data: {
        shipping: settings.shipping,
        order: {
          minimumAmount: settings.order.minimumAmount,
          minimumItemsCount: settings.order.minimumItemsCount
        }
      }
    });
  } catch (error) {
    console.error('Get shipping settings error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בקבלת הגדרות משלוח',
      error: error.message
    });
  }
};

export default {
  getShippingSettings
};
