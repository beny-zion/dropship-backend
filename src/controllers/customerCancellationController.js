/**
 * Customer Cancellation Controller
 * מאפשר ללקוחות לבטל פריטים כל עוד pending
 *
 * Phase 4: Customer Cancellations
 */

import Order from '../models/Order.js';

/**
 * בקשת ביטול פריט מלקוח
 * POST /api/orders/:orderId/items/:itemId/request-cancel
 *
 * מותר רק אם הפריט עדיין pending
 */
export const requestItemCancellation = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    // מצא הזמנה של המשתמש
    const order = await Order.findOne({
      _id: orderId,
      user: userId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    // מצא פריט
    const item = order.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'פריט לא נמצא בהזמנה'
      });
    }

    // בדיקה: רק pending ניתן לבטל
    // תמיכה גם ב-itemStatus (החדש) וגם ב-status (ישן)
    const currentStatus = item.itemStatus || item.status;

    if (currentStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'לא ניתן לבטל פריט שכבר הוזמן מהספק',
        currentStatus: currentStatus,
        canCancel: false
      });
    }

    // בדיקה: לא כבר מבוטל
    if (item.cancellation?.cancelled) {
      return res.status(400).json({
        success: false,
        message: 'פריט כבר מבוטל',
        canCancel: false
      });
    }

    // בטל את הפריט
    item.itemStatus = 'cancelled';
    item.cancellation = {
      cancelled: true,
      reason: reason || 'ביטול לבקשת לקוח',
      cancelledAt: new Date(),
      cancelledBy: userId,
      refundAmount: item.price * item.quantity,
      customerRequested: true,  // סימון שהלקוח ביקש
      refundProcessed: false    // טרם עובד - יעובד כשהתשלום יבוטל
    };

    // הוסף להיסטוריה
    item.statusHistory = item.statusHistory || [];
    item.statusHistory.push({
      status: 'cancelled',
      changedAt: new Date(),
      changedBy: userId,
      notes: `ביטול לבקשת לקוח: ${reason || 'ללא סיבה'}`
    });

    // הוסף ל-timeline של ההזמנה (visible to customer)
    order.timeline = order.timeline || [];
    order.timeline.push({
      status: 'item_cancelled',
      timestamp: new Date(),
      message: `הפריט "${item.name}" בוטל`,
      internal: false
    });

    // שמור (יפעיל pre-save hook)
    await order.save();

    console.log(`✅ פריט בוטל לבקשת לקוח - Order: ${order.orderNumber}, Item: ${item.name}`);

    res.json({
      success: true,
      message: 'הפריט בוטל בהצלחה',
      item: {
        id: item._id,
        name: item.name,
        status: item.itemStatus,
        refundAmount: item.cancellation.refundAmount
      },
      order: {
        orderNumber: order.orderNumber,
        paymentStatus: order.payment?.status || 'pending'
      }
    });

  } catch (error) {
    console.error('Request item cancellation error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בביטול הפריט',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * בדיקת אפשרות ביטול
 * GET /api/orders/:orderId/items/:itemId/can-cancel
 */
export const checkCancellationEligibility = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({
      _id: orderId,
      user: userId
    }).select('items payment');

    if (!order) {
      return res.status(404).json({
        canCancel: false,
        reason: 'הזמנה לא נמצאה'
      });
    }

    const item = order.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        canCancel: false,
        reason: 'פריט לא נמצא'
      });
    }

    // תמיכה גם ב-itemStatus (החדש) וגם ב-status (ישן)
    const currentStatus = item.itemStatus || item.status;
    const alreadyCancelled = item.cancellation?.cancelled || false;
    const canCancel = currentStatus === 'pending' && !alreadyCancelled;

    res.json({
      canCancel,
      itemStatus: currentStatus,
      alreadyCancelled,
      paymentStatus: order.payment?.status || 'pending',
      reason: canCancel ? null : (
        alreadyCancelled ? 'פריט כבר מבוטל' : 'פריט כבר הוזמן מהספק'
      )
    });

  } catch (error) {
    console.error('Check cancellation eligibility error:', error);
    res.status(500).json({
      canCancel: false,
      error: 'שגיאה בבדיקה'
    });
  }
};
