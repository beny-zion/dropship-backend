/**
 * Admin Order Items Controller
 *
 * Controller לניהול פריטים בהזמנות - למנהלים בלבד
 */

import mongoose from 'mongoose';
import Order from '../models/Order.js';
import { ITEM_STATUS, isValidStatusTransition, ITEM_STATUS_MESSAGES, ITEM_STATUS_TRANSITIONS, ITEM_STATUS_LABELS } from '../constants/itemStatuses.js';
import {
  calculateItemRefund,
  createRefundRecord,
  updateOrderPricing,
  checkOrderMinimumRequirements,
  computeOrderStatusFromItems
} from '../utils/orderCalculations.js';
import { getAllowedNextStatuses, getStatusTransitionError } from '../utils/itemStatusValidation.js';
import { suggestOrderStatusUpdate, getStatusSuggestionMessage } from '../utils/orderStatusSuggestion.js';

/**
 * עדכון סטטוס פריט
 * PUT /api/admin/orders/:orderId/items/:itemId/status
 */
export const updateItemStatus = async (req, res) => {
  // ✅ Start transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId, itemId } = req.params;
    const { newStatus, notes } = req.body;

    // בדיקת קלט
    if (!newStatus) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'נא לספק סטטוס חדש'
      });
    }

    // ✅ Optimistic locking - מצא הזמנה עם גרסה נוכחית
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    // שמור את הגרסה הנוכחית
    const currentVersion = order.__v;

    // מצא פריט
    const item = order.items.id(itemId);
    if (!item) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'פריט לא נמצא'
      });
    }

    // בדוק שהפריט לא בוטל
    if (item.cancellation?.cancelled) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'לא ניתן לעדכן סטטוס של פריט מבוטל'
      });
    }

    // בדוק תקינות מעבר סטטוס
    if (!isValidStatusTransition(item.itemStatus, newStatus)) {
      await session.abortTransaction();
      const allowedStatuses = getAllowedNextStatuses(item.itemStatus);
      return res.status(400).json({
        success: false,
        message: getStatusTransitionError(item.itemStatus, newStatus),
        currentStatus: item.itemStatus,
        attemptedStatus: newStatus,
        allowedTransitions: allowedStatuses.map(status => ({
          value: status,
          label: ITEM_STATUS_LABELS[status]
        }))
      });
    }

    const oldStatus = item.itemStatus;

    // עדכן סטטוס
    item.itemStatus = newStatus;

    // הוסף להיסטוריה
    item.statusHistory.push({
      status: newStatus,
      changedAt: new Date(),
      changedBy: req.user._id,
      notes: notes || ITEM_STATUS_MESSAGES[newStatus]
    });

    // ✅ Save with version check (Optimistic Locking) + trigger pre-save hooks
    try {
      // Check version hasn't changed
      const currentDoc = await Order.findById(orderId).session(session);
      if (!currentDoc || currentDoc.__v !== currentVersion) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: 'ההזמנה עודכנה על ידי משתמש אחר. נא לרענן את הדף ולנסות שוב',
          code: 'VERSION_CONFLICT'
        });
      }

      // Update the document
      currentDoc.items = order.items;

      // ✅ IMPORTANT: Use save() to trigger pre-save hooks (computed fields update)
      const result = await currentDoc.save({ session });

      // ✅ Commit transaction
      await session.commitTransaction();

      // בדוק אם צריך להציע עדכון סטטוס ראשי
      const suggestion = suggestOrderStatusUpdate(result);

      const suggestionMessage = suggestion ? getStatusSuggestionMessage(suggestion, {
        pending: 'ממתין לאישור',
        payment_hold: 'מסגרת אשראי תפוסה',
        ordered: 'הוזמן מארה"ב',
        arrived_us_warehouse: 'הגיע למחסן ארה"ב',
        shipped_to_israel: 'נשלח לישראל',
        customs_israel: 'במכס בישראל',
        arrived_israel_warehouse: 'הגיע למחסן בישראל',
        shipped_to_customer: 'נשלח ללקוח',
        delivered: 'נמסר',
        cancelled: 'בוטל'
      }) : null;

      res.json({
        success: true,
        data: {
          item: result.items.id(itemId).toObject(),
          message: `סטטוס פריט עודכן מ-${oldStatus} ל-${newStatus}`,
          orderStatusSuggestion: suggestionMessage
        }
      });

    } catch (updateError) {
      await session.abortTransaction();
      throw updateError;
    }

  } catch (error) {
    await session.abortTransaction();
    console.error('Update item status error:', error);

    if (error.code === 'VERSION_CONFLICT') {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון סטטוס פריט',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

/**
 * הזמנה מספק
 * POST /api/admin/orders/:orderId/items/:itemId/order-from-supplier
 */
export const orderFromSupplier = async (req, res) => {
  // ✅ Start MongoDB transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId, itemId } = req.params;
    const {
      supplierOrderNumber,
      supplierTrackingNumber,
      actualCost,
      notes
    } = req.body;

    // ✅ Validation
    if (actualCost && (isNaN(actualCost) || actualCost < 0)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'עלות בפועל חייבת להיות מספר חיובי'
      });
    }

    // ✅ Find order with session
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    // מצא פריט
    const item = order.items.id(itemId);
    if (!item) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'פריט לא נמצא'
      });
    }

    // בדוק שהפריט לא בוטל
    if (item.cancellation?.cancelled) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'לא ניתן להזמין פריט מבוטל'
      });
    }

    // בדוק שהפריט לא כבר הוזמן
    if (item.supplierOrder?.orderedAt) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'הפריט כבר הוזמן מספק',
        existingOrder: item.supplierOrder
      });
    }

    // עדכן פרטי הזמנה מספק
    item.supplierOrder = {
      orderedAt: new Date(),
      orderedBy: req.user._id,
      supplierOrderNumber: supplierOrderNumber?.trim() || null,
      supplierTrackingNumber: supplierTrackingNumber?.trim() || null,
      actualCost: actualCost || item.price,
      notes: notes?.trim() || null
    };

    // עדכן סטטוס
    item.itemStatus = ITEM_STATUS.ORDERED_FROM_SUPPLIER;

    // הוסף להיסטוריה
    item.statusHistory.push({
      status: ITEM_STATUS.ORDERED_FROM_SUPPLIER,
      changedAt: new Date(),
      changedBy: req.user._id,
      notes: `הוזמן מספק${supplierOrderNumber ? ` - מספר הזמנה: ${supplierOrderNumber}` : ''}`
    });

    // ✅ Save with session
    await order.save({ session });

    // ✅ Commit transaction
    await session.commitTransaction();

    // בדוק אם צריך להציע עדכון סטטוס ראשי
    const suggestion = suggestOrderStatusUpdate(order);
    const suggestionMessage = suggestion ? getStatusSuggestionMessage(suggestion, {
      pending: 'ממתין לאישור',
      payment_hold: 'מסגרת אשראי תפוסה',
      ordered: 'הוזמן מארה"ב',
      arrived_us_warehouse: 'הגיע למחסן ארה"ב',
      shipped_to_israel: 'נשלח לישראל',
      customs_israel: 'במכס בישראל',
      arrived_israel_warehouse: 'הגיע למחסן בישראל',
      shipped_to_customer: 'נשלח ללקוח',
      delivered: 'נמסר',
      cancelled: 'בוטל'
    }) : null;

    res.json({
      success: true,
      data: {
        item: item.toObject(),
        message: 'הפריט הוזמן בהצלחה מהספק',
        orderStatusSuggestion: suggestionMessage
      }
    });

  } catch (error) {
    // ✅ Rollback on error
    await session.abortTransaction();
    console.error('Order from supplier error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בהזמנה מספק',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    // ✅ Always end session
    session.endSession();
  }
};

/**
 * ביטול פריט
 * POST /api/admin/orders/:orderId/items/:itemId/cancel
 */
export const cancelItem = async (req, res) => {
  // ✅ Start MongoDB transaction for data consistency
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    // ✅ Validation
    if (!reason || reason.trim().length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'נא לספק סיבה לביטול'
      });
    }

    if (reason.length > 500) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'סיבת הביטול ארוכה מדי (מקסימום 500 תווים)'
      });
    }

    // ✅ Find order with session
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    // מצא פריט
    const item = order.items.id(itemId);
    if (!item) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'פריט לא נמצא'
      });
    }

    // בדוק שהפריט לא כבר מבוטל
    if (item.cancellation?.cancelled) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'הפריט כבר מבוטל'
      });
    }

    // חשב refund
    const refundAmount = calculateItemRefund(item);

    // עדכן ביטול
    item.cancellation = {
      cancelled: true,
      reason: reason.trim(),
      cancelledAt: new Date(),
      cancelledBy: req.user._id,
      refundAmount,
      refundProcessed: false
    };

    // עדכן סטטוס
    item.itemStatus = ITEM_STATUS.CANCELLED;

    // הוסף להיסטוריה
    item.statusHistory.push({
      status: ITEM_STATUS.CANCELLED,
      changedAt: new Date(),
      changedBy: req.user._id,
      notes: `בוטל - ${reason.trim()}`
    });

    // צור refund record
    const refundRecord = createRefundRecord(item, reason.trim(), req.user._id);
    order.refunds.push(refundRecord);

    // עדכן pricing
    const updatedPricing = updateOrderPricing(order);
    order.pricing = updatedPricing;

    // בדוק מינימום
    const minimumCheck = checkOrderMinimumRequirements(order);

    // ✅ Save with session
    await order.save({ session });

    // ✅ Commit transaction
    await session.commitTransaction();

    // בדוק אם צריך להציע עדכון סטטוס ראשי
    const suggestion = suggestOrderStatusUpdate(order);
    const suggestionMessage = suggestion ? getStatusSuggestionMessage(suggestion, {
      pending: 'ממתין לאישור',
      payment_hold: 'מסגרת אשראי תפוסה',
      ordered: 'הוזמן מארה"ב',
      arrived_us_warehouse: 'הגיע למחסן ארה"ב',
      shipped_to_israel: 'נשלח לישראל',
      customs_israel: 'במכס בישראל',
      arrived_israel_warehouse: 'הגיע למחסן בישראל',
      shipped_to_customer: 'נשלח ללקוח',
      delivered: 'נמסר',
      cancelled: 'בוטל'
    }) : null;

    res.json({
      success: true,
      data: {
        item: item.toObject(),
        refund: refundRecord,
        orderUpdate: {
          adjustedTotal: order.pricing.adjustedTotal,
          totalRefunds: order.pricing.totalRefunds,
          meetsMinimum: minimumCheck.meetsMinimum,
          activeItemsCount: minimumCheck.activeItemsCount,
          minimumCheck
        },
        message: `הפריט בוטל. נדרש החזר של ${refundAmount} ש"ח`,
        orderStatusSuggestion: suggestionMessage
      }
    });

  } catch (error) {
    // ✅ Rollback transaction on error
    await session.abortTransaction();
    console.error('Cancel item error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בביטול פריט',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    // ✅ Always end session
    session.endSession();
  }
};

/**
 * קבלת היסטוריה של פריט
 * GET /api/admin/orders/:orderId/items/:itemId/history
 */
export const getItemHistory = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    const order = await Order.findById(orderId)
      .populate('items.statusHistory.changedBy', 'firstName lastName email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'פריט לא נמצא'
      });
    }

    res.json({
      success: true,
      data: {
        item: {
          _id: item._id,
          name: item.name,
          currentStatus: item.itemStatus
        },
        history: item.statusHistory
      }
    });

  } catch (error) {
    console.error('Get item history error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בשליפת היסטוריה'
    });
  }
};

/**
 * עדכון כמה פריטים בבת אחת
 * PUT /api/admin/orders/:orderId/items/bulk-update
 */
export const bulkUpdateItems = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { itemIds, newStatus, notes } = req.body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'נא לספק מערך של מזהי פריטים'
      });
    }

    // ✅ SECURITY: Prevent DoS attacks by limiting bulk operations
    if (itemIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'ניתן לעדכן עד 100 פריטים בבת אחת. נבחרו ' + itemIds.length + ' פריטים.'
      });
    }

    if (!newStatus) {
      return res.status(400).json({
        success: false,
        message: 'נא לספק סטטוס חדש'
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'הזמנה לא נמצאה'
      });
    }

    const updatedItems = [];
    const errors = [];

    for (const itemId of itemIds) {
      const item = order.items.id(itemId);

      if (!item) {
        errors.push({ itemId, error: 'פריט לא נמצא' });
        continue;
      }

      if (item.cancellation?.cancelled) {
        errors.push({ itemId, error: 'פריט מבוטל' });
        continue;
      }

      if (!isValidStatusTransition(item.itemStatus, newStatus)) {
        errors.push({
          itemId,
          error: getStatusTransitionError(item.itemStatus, newStatus),
          currentStatus: item.itemStatus,
          attemptedStatus: newStatus,
          allowedTransitions: getAllowedNextStatuses(item.itemStatus)
        });
        continue;
      }

      item.itemStatus = newStatus;
      item.statusHistory.push({
        status: newStatus,
        changedAt: new Date(),
        changedBy: req.user._id,
        notes: notes || ITEM_STATUS_MESSAGES[newStatus]
      });

      updatedItems.push(item.toObject());
    }

    await order.save();

    res.json({
      success: true,
      data: {
        updated: updatedItems.length,
        errors: errors.length,
        updatedItems,
        errors,
        message: `${updatedItems.length} פריטים עודכנו בהצלחה`
      }
    });

  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון קבוצתי'
    });
  }
};

/**
 * הזמנה מרוכזת מספק - עבור מספר פריטים ממספר הזמנות
 * POST /api/admin/orders/items/bulk-order-from-supplier
 */
export const bulkOrderFromSupplier = async (req, res) => {
  const { supplierName, orderedItems, unavailableItems, supplierOrderData } = req.body;

  // Validation
  if (!supplierName) {
    return res.status(400).json({
      success: false,
      message: 'חסר שם ספק'
    });
  }

  // לפחות אחד מהם חייב להיות קיים
  const hasOrderedItems = orderedItems && Array.isArray(orderedItems) && orderedItems.length > 0;
  const hasUnavailableItems = unavailableItems && Array.isArray(unavailableItems) && unavailableItems.length > 0;

  if (!hasOrderedItems && !hasUnavailableItems) {
    return res.status(400).json({
      success: false,
      message: 'חסרים פריטים להזמנה או לסימון כלא זמינים'
    });
  }

  const itemIds = orderedItems || [];
  const totalItems = itemIds.length + (unavailableItems?.length || 0);

  // ✅ SECURITY: Prevent DoS attacks by limiting bulk operations
  if (totalItems > 100) {
    return res.status(400).json({
      success: false,
      message: 'ניתן לעדכן עד 100 פריטים בבת אחת. נבחרו ' + totalItems + ' פריטים.'
    });
  }

  // ולידציה למספר הזמנה (חובה אם יש פריטים מוזמנים)
  if (hasOrderedItems && !supplierOrderData?.supplierOrderNumber) {
    return res.status(400).json({
      success: false,
      message: 'חובה להזין מספר הזמנה של הספק'
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = [];
    const errors = [];
    const unavailableResults = [];

    // טיפול בפריטים מוזמנים
    for (const itemId of itemIds) {
      try {
        // מצא את ההזמנה שמכילה את הפריט
        const order = await Order.findOne({ 'items._id': itemId }).session(session);

        if (!order) {
          errors.push({ itemId, error: 'לא נמצאה הזמנה' });
          continue;
        }

        const item = order.items.id(itemId);

        if (!item) {
          errors.push({ itemId, error: 'לא נמצא פריט' });
          continue;
        }

        if (item.cancellation?.cancelled) {
          errors.push({ itemId, error: 'פריט מבוטל' });
          continue;
        }

        if (item.itemStatus !== 'pending') {
          errors.push({
            itemId,
            error: 'פריט כבר הוזמן',
            currentStatus: item.itemStatus
          });
          continue;
        }

        // ✅ SECURITY FIX: Whitelist only allowed fields (prevent Mass Assignment)
        const supplierOrderNumber = supplierOrderData?.supplierOrderNumber;
        const actualCost = supplierOrderData?.actualCost;
        const trackingNumber = supplierOrderData?.trackingNumber;
        const estimatedDelivery = supplierOrderData?.estimatedDelivery;
        const notes = supplierOrderData?.notes;

        // Validate and sanitize inputs
        const sanitizedSupplierOrderNumber = supplierOrderNumber
          ? String(supplierOrderNumber).trim().substring(0, 100)
          : '';

        const sanitizedActualCost = actualCost && !isNaN(actualCost) && actualCost > 0
          ? parseFloat(actualCost)
          : item.price;

        const sanitizedTrackingNumber = trackingNumber
          ? String(trackingNumber).trim().substring(0, 100)
          : '';

        const sanitizedEstimatedDelivery = estimatedDelivery
          ? new Date(estimatedDelivery)
          : null;

        const sanitizedNotes = notes
          ? String(notes).trim().substring(0, 500)
          : `הוזמן מרוכז מ-${supplierName}`;

        // עדכן פריט
        item.itemStatus = 'ordered_from_supplier';
        item.supplierOrder = {
          orderedAt: new Date(),
          orderedBy: req.user._id,
          supplierOrderNumber: sanitizedSupplierOrderNumber,
          supplierTrackingNumber: sanitizedTrackingNumber,
          actualCost: sanitizedActualCost,
          notes: sanitizedNotes
        };

        // הוסף להיסטוריה
        item.statusHistory.push({
          status: 'ordered_from_supplier',
          changedAt: new Date(),
          changedBy: req.user._id,
          notes: `הוזמן מרוכז מ-${supplierName}`
        });

        await order.save({ session });

        results.push({
          itemId,
          orderId: order._id,
          orderNumber: order.orderNumber,
          itemName: item.name,
          success: true
        });

      } catch (itemError) {
        errors.push({ itemId, error: itemError.message });
      }
    }

    // טיפול בפריטים לא זמינים
    if (hasUnavailableItems) {
      const Product = mongoose.model('Product');

      for (const unavailableItem of unavailableItems) {
        try {
          const { itemId, productId, variantSku } = unavailableItem;

          // 1. עדכון המוצר/ווריאנט כלא זמין
          if (variantSku) {
            // עדכון ווריאנט ספציפי
            await Product.findOneAndUpdate(
              { _id: productId, 'variants.sku': variantSku },
              {
                $set: {
                  'variants.$.stock.available': false,
                  'variants.$.stock.quantity': 0
                }
              },
              { session }
            );
          } else {
            // עדכון מוצר שלם
            await Product.findByIdAndUpdate(
              productId,
              {
                $set: {
                  'stock.available': false,
                  'stock.quantity': 0
                }
              },
              { session }
            );
          }

          // 2. ביטול הפריט בהזמנה
          const order = await Order.findOne({ 'items._id': itemId }).session(session);

          if (order) {
            const item = order.items.id(itemId);

            if (item && !item.cancellation?.cancelled) {
              item.itemStatus = 'cancelled';
              item.cancellation = {
                cancelled: true,
                reason: 'out_of_stock',
                cancelledAt: new Date(),
                cancelledBy: req.user._id,
                refundAmount: item.price
              };

              item.statusHistory.push({
                status: 'cancelled',
                changedAt: new Date(),
                changedBy: req.user._id,
                notes: 'מוצר לא זמין אצל הספק'
              });

              await order.save({ session });

              unavailableResults.push({
                itemId,
                orderId: order._id,
                orderNumber: order.orderNumber,
                itemName: item.name,
                variantSku,
                success: true
              });
            }
          }

        } catch (unavailableError) {
          errors.push({
            itemId: unavailableItem.itemId,
            error: unavailableError.message,
            type: 'unavailable'
          });
        }
      }
    }

    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        message: `הוזמנו ${results.length} פריטים מ-${supplierName}${unavailableResults.length > 0 ? `, ${unavailableResults.length} סומנו כלא זמינים` : ''}`,
        totalOrdered: results.length,
        totalUnavailable: unavailableResults.length,
        totalFailed: errors.length,
        results,
        unavailableResults,
        errors
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Bulk order from supplier error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בהזמנה מרוכזת',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

export default {
  updateItemStatus,
  orderFromSupplier,
  cancelItem,
  getItemHistory,
  bulkUpdateItems,
  bulkOrderFromSupplier
};
