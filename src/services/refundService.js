/**
 * Refund Service
 *
 * Phase 10: ניהול החזרים
 * מטפל בכל הלוגיקה העסקית של החזרי כספים
 *
 * שיטת עבודה: הלקוח מקריא פרטי כרטיס בטלפון והמנהל מזכה אותו
 */

import Order from '../models/Order.js';
import { sendRequest, isSuccessCode, getErrorMessage, getConfig } from '../utils/hypPayClient.js';

/**
 * חישוב סכום ההחזר עבור פריטים נבחרים
 *
 * @param {Object} order - ההזמנה
 * @param {Array} itemIds - מזהי הפריטים להחזר
 * @returns {Object} פירוט סכומי ההחזר
 */
function calculateRefundAmount(order, itemIds) {
  const activeItems = order.items.filter(item =>
    !item.cancellation?.cancelled && itemIds.includes(item._id.toString())
  );

  if (activeItems.length === 0) {
    return {
      itemsTotal: 0,
      shippingRefund: 0,
      totalRefund: 0,
      items: []
    };
  }

  // חישוב סכום הפריטים
  const itemsTotal = activeItems.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);

  // בדיקה אם כל הפריטים הפעילים מוחזרים (להחזרת משלוח)
  const allActiveItems = order.items.filter(item => !item.cancellation?.cancelled);
  const isFullRefund = itemIds.length === allActiveItems.length;

  // החזר משלוח רק בהחזר מלא
  const shippingRefund = isFullRefund ? (order.pricing.shipping || 0) : 0;

  // סה"כ להחזר
  const totalRefund = itemsTotal + shippingRefund;

  // וודא שלא מחזירים יותר מהסכום שנגבה
  const maxRefundable = (order.payment.chargedAmount || order.pricing.total) -
                        (order.payment.refundedAmount || 0);

  return {
    itemsTotal: Math.round(itemsTotal * 100) / 100,
    shippingRefund: Math.round(shippingRefund * 100) / 100,
    totalRefund: Math.min(Math.round(totalRefund * 100) / 100, maxRefundable),
    maxRefundable: Math.round(maxRefundable * 100) / 100,
    isFullRefund,
    items: activeItems.map(item => ({
      id: item._id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.price * item.quantity
    }))
  };
}

/**
 * ביצוע זיכוי בכרטיס אשראי
 * שולח עסקה עם סכום שלילי לזיכוי הכרטיס
 *
 * @param {Object} cardDetails - פרטי הכרטיס
 * @param {Number} amount - סכום לזיכוי
 * @param {Object} options - אפשרויות נוספות
 * @returns {Promise<Object>} תוצאת הזיכוי
 */
async function refundWithCard(cardDetails, amount, options = {}) {
  const config = getConfig();

  // ✅ Mock Mode
  if (config.HYP_MOCK_MODE) {
    console.log('🟡 MOCK MODE: Simulating Card-based Refund');
    console.log('   Card:', `****${cardDetails.cardNumber.slice(-4)}`);
    console.log('   Amount:', amount);

    const mockRefundId = `CARD-REFUND-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      success: true,
      refundId: mockRefundId,
      amount: amount,
      CCode: '0',
      ACode: '0012345',
      method: 'card'
    };
  }

  // ולידציה
  if (!cardDetails?.cardNumber || !cardDetails?.expMonth || !cardDetails?.expYear) {
    return {
      success: false,
      error: 'פרטי כרטיס חסרים',
      errorCode: 'MISSING_CARD'
    };
  }

  if (!amount || amount <= 0) {
    return {
      success: false,
      error: 'סכום הזיכוי חייב להיות גדול מ-0',
      errorCode: 'INVALID_AMOUNT'
    };
  }

  // זיכוי = סכום שלילי
  const params = {
    action: 'soft',
    Amount: -Math.abs(amount),  // ✅ סכום שלילי = זיכוי
    CC: cardDetails.cardNumber,
    Tmonth: cardDetails.expMonth.padStart(2, '0'),
    Tyear: cardDetails.expYear,
    Cvv: cardDetails.cvv,
    UserId: cardDetails.holderId,
    Coin: '1',
    Order: options.orderNumber || '',
    Info: options.reason || 'זיכוי'
  };

  try {
    console.log(`[RefundWithCard] Attempting card-based refund: ₪${amount}`);

    const result = await sendRequest(params);

    // סכום שלילי מחזיר CCode=0 בהצלחה
    if (result.CCode === '0') {
      console.log(`✅ Card-based refund successful: ${result.Id} (₪${amount})`);

      return {
        success: true,
        refundId: result.Id,
        amount: amount,
        CCode: result.CCode,
        ACode: result.ACode,
        invoiceNumber: result.HeshASM || result.Hesh,
        method: 'card'
      };
    } else {
      const errorMessage = getErrorMessage(result);
      console.error(`❌ Card-based refund failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        errorCode: result.CCode,
        method: 'card'
      };
    }

  } catch (error) {
    console.error('❌ Card refund request error:', error.message);
    return {
      success: false,
      error: `תקלה בביצוע הזיכוי: ${error.message}`,
      errorCode: 'NETWORK_ERROR',
      method: 'card'
    };
  }
}

/**
 * ביצוע גביה מכרטיס אשראי חדש (מיידי, ללא J5)
 * שולח עסקה עם סכום חיובי לגביית הכרטיס
 *
 * @param {Object} cardDetails - פרטי הכרטיס
 * @param {Number} amount - סכום לגבייה
 * @param {Object} options - אפשרויות נוספות
 * @returns {Promise<Object>} תוצאת הגבייה
 */
async function chargeWithNewCard(cardDetails, amount, options = {}) {
  const config = getConfig();

  // ✅ Mock Mode
  if (config.HYP_MOCK_MODE) {
    console.log('🟡 MOCK MODE: Simulating New Card Charge');
    console.log('   Card:', `****${cardDetails.cardNumber.slice(-4)}`);
    console.log('   Amount:', amount);

    const mockChargeId = `CARD-CHARGE-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      success: true,
      transactionId: mockChargeId,
      amount: amount,
      CCode: '0',
      ACode: '0012345',
      method: 'new_card'
    };
  }

  // ולידציה
  if (!cardDetails?.cardNumber || !cardDetails?.expMonth || !cardDetails?.expYear) {
    return {
      success: false,
      error: 'פרטי כרטיס חסרים',
      errorCode: 'MISSING_CARD'
    };
  }

  if (!amount || amount <= 0) {
    return {
      success: false,
      error: 'סכום הגבייה חייב להיות גדול מ-0',
      errorCode: 'INVALID_AMOUNT'
    };
  }

  // גביה מיידית = action: soft עם סכום חיובי
  const params = {
    action: 'soft',
    Amount: Math.abs(amount),  // ✅ סכום חיובי = גבייה
    CC: cardDetails.cardNumber,
    Tmonth: cardDetails.expMonth.padStart(2, '0'),
    Tyear: cardDetails.expYear,
    Cvv: cardDetails.cvv,
    UserId: cardDetails.holderId,
    Coin: '1',
    Order: options.orderNumber || '',
    Info: options.reason || 'גבייה מיידית',
    ClientName: options.customerName?.split(' ')[0] || '',
    ClientLName: options.customerName?.split(' ')[1] || ''
  };

  try {
    console.log(`[ChargeWithNewCard] Attempting immediate card charge: ₪${amount}`);

    const result = await sendRequest(params);

    // סכום חיובי מחזיר CCode=0 בהצלחה
    if (result.CCode === '0') {
      console.log(`✅ Card charge successful: ${result.Id} (₪${amount})`);

      return {
        success: true,
        transactionId: result.Id,
        amount: amount,
        CCode: result.CCode,
        ACode: result.ACode,
        invoiceNumber: result.HeshASM || result.Hesh,
        UID: result.UID,
        method: 'new_card'
      };
    } else {
      const errorMessage = getErrorMessage(result);
      console.error(`❌ Card charge failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        errorCode: result.CCode,
        method: 'new_card'
      };
    }

  } catch (error) {
    console.error('❌ Card charge request error:', error.message);
    return {
      success: false,
      error: `תקלה בביצוע הגבייה: ${error.message}`,
      errorCode: 'NETWORK_ERROR',
      method: 'new_card'
    };
  }
}

/**
 * ביצוע החזר כספי
 *
 * @param {String} orderId - מזהה ההזמנה
 * @param {Array} itemIds - מזהי הפריטים להחזר (ריק = החזר מלא)
 * @param {String} reason - סיבת ההחזר
 * @param {Object} adminUser - המשתמש שמבצע את ההחזר
 * @param {Number} customAmount - סכום מותאם (אופציונלי)
 * @param {Object} cardDetails - פרטי כרטיס אשראי
 * @returns {Promise<Object>} תוצאת ההחזר
 */
async function processRefund(orderId, itemIds, reason, adminUser, customAmount = null, cardDetails = null) {
  // טען את ההזמנה
  const order = await Order.findById(orderId);

  if (!order) {
    throw new Error('הזמנה לא נמצאה');
  }

  // וידוא שיש פרטי כרטיס
  if (!cardDetails) {
    throw new Error('נדרשים פרטי כרטיס אשראי לביצוע ההחזר');
  }

  // וידוא שההזמנה נגבתה
  if (!['charged', 'partial_refund'].includes(order.payment.status)) {
    throw new Error('ניתן להחזיר רק הזמנות שנגבו בהצלחה');
  }

  // אם לא נבחרו פריטים ספציפיים - החזר את כל הפריטים הפעילים
  if (!itemIds || itemIds.length === 0) {
    itemIds = order.items
      .filter(item => !item.cancellation?.cancelled && item.itemStatus !== 'refunded')
      .map(item => item._id.toString());
  }

  // חישוב סכום ההחזר
  const refundCalculation = calculateRefundAmount(order, itemIds);

  // אם נתון סכום מותאם - השתמש בו (עם בדיקה)
  const refundAmount = customAmount !== null
    ? Math.min(customAmount, refundCalculation.maxRefundable)
    : refundCalculation.totalRefund;

  if (refundAmount <= 0) {
    throw new Error('סכום ההחזר חייב להיות גדול מ-0');
  }

  if (refundAmount > refundCalculation.maxRefundable) {
    throw new Error(`סכום ההחזר (₪${refundAmount}) גדול מהסכום המקסימלי להחזר (₪${refundCalculation.maxRefundable})`);
  }

  // ביצוע ההחזר בכרטיס האשראי
  const hypResult = await refundWithCard(cardDetails, refundAmount, {
    orderNumber: order.orderNumber,
    reason
  });

  if (!hypResult.success) {
    // שמירת ניסיון כושל
    order.refunds.push({
      amount: refundAmount,
      reason,
      items: itemIds.map(id => ({ _id: id })),
      status: 'failed',
      processedBy: adminUser._id,
      hypError: hypResult.error,
      hypErrorCode: hypResult.errorCode,
      refundMethod: 'card',
      createdAt: new Date()
    });

    order.timeline.push({
      status: 'refund_failed',
      message: `ניסיון החזר נכשל: ${hypResult.error}`,
      timestamp: new Date(),
      internal: true
    });

    await order.save();

    return {
      success: false,
      error: hypResult.error,
      errorCode: hypResult.errorCode
    };
  }

  // הצלחה - עדכון ההזמנה
  const refundRecord = {
    amount: refundAmount,
    reason,
    items: itemIds.map(id => ({ _id: id })),
    status: 'completed',
    processedBy: adminUser._id,
    processedAt: new Date(),
    hypRefundId: hypResult.refundId,
    hypACode: hypResult.ACode,
    invoiceNumber: hypResult.invoiceNumber,
    refundMethod: 'card',
    createdAt: new Date()
  };

  order.refunds.push(refundRecord);

  // עדכון סכום ההחזר הכולל
  order.payment.refundedAmount = (order.payment.refundedAmount || 0) + refundAmount;

  // עדכון סטטוס תשלום
  const totalRefunded = order.payment.refundedAmount;
  const totalCharged = order.payment.chargedAmount || order.pricing.total;

  if (totalRefunded >= totalCharged) {
    order.payment.status = 'full_refund';
  } else {
    order.payment.status = 'partial_refund';
  }

  // עדכון סטטוס פריטים
  itemIds.forEach(itemId => {
    const item = order.items.id(itemId);
    if (item) {
      item.itemStatus = 'cancelled';
      item.cancellation = {
        cancelled: true,
        reason: reason,
        cancelledAt: new Date(),
        cancelledBy: adminUser._id,
        refundAmount: item.price * item.quantity,
        refundProcessed: true
      };
    }
  });

  // עדכון pricing
  order.pricing.totalRefunds = totalRefunded;
  order.pricing.adjustedTotal = totalCharged - totalRefunded;

  // טיימליין - אירוע גלוי ללקוח
  order.timeline.push({
    status: 'refund_completed',
    message: `בוצע החזר כספי בסך ₪${refundAmount}`,
    timestamp: new Date(),
    internal: false
  });

  // טיימליין - אירוע פנימי
  order.timeline.push({
    status: 'refund_processed',
    message: `החזר ₪${refundAmount} בוצע ע"י ${adminUser.name || adminUser.email}. סיבה: ${reason}`,
    timestamp: new Date(),
    internal: true
  });

  // אם כל הפריטים בוטלו - סגור את ההזמנה
  const remainingActiveItems = order.items.filter(
    item => !item.cancellation?.cancelled && item.itemStatus !== 'refunded'
  );

  if (remainingActiveItems.length === 0) {
    order.status = 'cancelled';
    order.timeline.push({
      status: 'cancelled',
      message: 'ההזמנה בוטלה - כל הפריטים הוחזרו',
      timestamp: new Date(),
      internal: false
    });
  }

  await order.save();

  return {
    success: true,
    refund: {
      id: order.refunds[order.refunds.length - 1]._id,
      amount: refundAmount,
      hypRefundId: hypResult.refundId,
      itemsRefunded: itemIds.length,
      isFullRefund: refundCalculation.isFullRefund,
      newPaymentStatus: order.payment.status,
      totalRefundedSoFar: order.payment.refundedAmount
    }
  };
}

/**
 * קבלת היסטוריית החזרים של הזמנה
 *
 * @param {String} orderId - מזהה ההזמנה
 * @returns {Promise<Array>} רשימת ההחזרים
 */
async function getOrderRefunds(orderId) {
  const order = await Order.findById(orderId)
    .populate('refunds.processedBy', 'name email')
    .select('refunds orderNumber payment.refundedAmount payment.chargedAmount');

  if (!order) {
    throw new Error('הזמנה לא נמצאה');
  }

  return {
    orderNumber: order.orderNumber,
    totalCharged: order.payment.chargedAmount || 0,
    totalRefunded: order.payment.refundedAmount || 0,
    refunds: order.refunds.map(refund => ({
      id: refund._id,
      amount: refund.amount,
      reason: refund.reason,
      status: refund.status,
      processedBy: refund.processedBy,
      processedAt: refund.processedAt,
      hypRefundId: refund.hypRefundId,
      createdAt: refund.createdAt
    }))
  };
}

/**
 * קבלת כל ההחזרים במערכת (לדשבורד אדמין)
 *
 * @param {Object} filters - פילטרים
 * @param {Number} page - עמוד
 * @param {Number} limit - מספר תוצאות
 * @returns {Promise<Object>} רשימת החזרים + מטאדאטה
 */
async function getAllRefunds(filters = {}, page = 1, limit = 20) {
  const query = { 'refunds.0': { $exists: true } }; // הזמנות עם לפחות החזר אחד

  // פילטר לפי סטטוס החזר
  if (filters.status) {
    query['refunds.status'] = filters.status;
  }

  // פילטר לפי תאריך
  if (filters.fromDate || filters.toDate) {
    query['refunds.createdAt'] = {};
    if (filters.fromDate) {
      query['refunds.createdAt'].$gte = new Date(filters.fromDate);
    }
    if (filters.toDate) {
      query['refunds.createdAt'].$lte = new Date(filters.toDate);
    }
  }

  const skip = (page - 1) * limit;

  const orders = await Order.find(query)
    .populate('user', 'name email')
    .populate('refunds.processedBy', 'name email')
    .select('orderNumber user refunds payment.chargedAmount payment.refundedAmount createdAt')
    .sort({ 'refunds.createdAt': -1 })
    .skip(skip)
    .limit(limit);

  const total = await Order.countDocuments(query);

  // פלטן את ההחזרים
  const refunds = [];
  orders.forEach(order => {
    order.refunds.forEach(refund => {
      refunds.push({
        id: refund._id,
        orderId: order._id,
        orderNumber: order.orderNumber,
        customer: order.user,
        amount: refund.amount,
        reason: refund.reason,
        status: refund.status,
        processedBy: refund.processedBy,
        processedAt: refund.processedAt,
        hypRefundId: refund.hypRefundId,
        createdAt: refund.createdAt
      });
    });
  });

  // מיון לפי תאריך
  refunds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // סטטיסטיקות
  const stats = await getRefundStats();

  return {
    refunds: refunds.slice(0, limit),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    stats
  };
}

/**
 * קבלת סטטיסטיקות החזרים
 *
 * @returns {Promise<Object>} סטטיסטיקות
 */
async function getRefundStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // סטטיסטיקות החודש
  const thisMonthStats = await Order.aggregate([
    { $unwind: '$refunds' },
    { $match: {
      'refunds.status': 'completed',
      'refunds.createdAt': { $gte: startOfMonth }
    }},
    { $group: {
      _id: null,
      totalAmount: { $sum: '$refunds.amount' },
      count: { $sum: 1 }
    }}
  ]);

  // סטטיסטיקות חודש שעבר
  const lastMonthStats = await Order.aggregate([
    { $unwind: '$refunds' },
    { $match: {
      'refunds.status': 'completed',
      'refunds.createdAt': { $gte: startOfLastMonth, $lte: endOfLastMonth }
    }},
    { $group: {
      _id: null,
      totalAmount: { $sum: '$refunds.amount' },
      count: { $sum: 1 }
    }}
  ]);

  // החזרים ממתינים (כושלים)
  const pendingRefunds = await Order.aggregate([
    { $unwind: '$refunds' },
    { $match: { 'refunds.status': 'failed' }},
    { $group: {
      _id: null,
      totalAmount: { $sum: '$refunds.amount' },
      count: { $sum: 1 }
    }}
  ]);

  return {
    thisMonth: {
      amount: thisMonthStats[0]?.totalAmount || 0,
      count: thisMonthStats[0]?.count || 0
    },
    lastMonth: {
      amount: lastMonthStats[0]?.totalAmount || 0,
      count: lastMonthStats[0]?.count || 0
    },
    failed: {
      amount: pendingRefunds[0]?.totalAmount || 0,
      count: pendingRefunds[0]?.count || 0
    }
  };
}

/**
 * בדיקת יכולת להחזר
 *
 * @param {String} orderId - מזהה ההזמנה
 * @returns {Promise<Object>} מידע על יכולת ההחזר
 */
async function canRefund(orderId) {
  const order = await Order.findById(orderId);

  if (!order) {
    return { canRefund: false, reason: 'הזמנה לא נמצאה' };
  }

  if (!['charged', 'partial_refund'].includes(order.payment.status)) {
    return { canRefund: false, reason: 'ההזמנה לא נגבתה עדיין' };
  }

  const maxRefundable = (order.payment.chargedAmount || order.pricing.total) -
                        (order.payment.refundedAmount || 0);

  if (maxRefundable <= 0) {
    return { canRefund: false, reason: 'ההזמנה כבר הוחזרה במלואה' };
  }

  const refundableItems = order.items.filter(
    item => !item.cancellation?.cancelled && item.itemStatus !== 'refunded'
  );

  return {
    canRefund: true,
    maxRefundable,
    chargedAmount: order.payment.chargedAmount || order.pricing.total,
    refundedAmount: order.payment.refundedAmount || 0,
    refundableItems: refundableItems.map(item => ({
      id: item._id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.price * item.quantity
    }))
  };
}

export {
  calculateRefundAmount,
  processRefund,
  getOrderRefunds,
  getAllRefunds,
  getRefundStats,
  canRefund,
  chargeWithNewCard
};

export default {
  calculateRefundAmount,
  processRefund,
  getOrderRefunds,
  getAllRefunds,
  getRefundStats,
  canRefund,
  chargeWithNewCard
};
