/**
 * Minimum Order Enforcement Utility
 *
 * ✨ NEW: אכיפת מינימום הזמנה עם התראות אוטומטיות
 */

import SystemSettings from '../models/SystemSettings.js';

/**
 * בדיקה אם ההזמנה עומדת במינימום
 *
 * @param {Object} order - אובייקט ההזמנה
 * @returns {Object} - תוצאת הבדיקה
 */
export async function checkMinimumRequirements(order) {
  const settings = await SystemSettings.getSettings();
  const minimumAmount = settings.order.minimumAmount.ils;
  const minimumCount = settings.order.minimumItemsCount;

  // חישוב פריטים פעילים (לא מבוטלים)
  const activeItems = order.items.filter(item => !item.cancellation?.cancelled);
  const activeItemsCount = activeItems.length;

  // חישוב סכום פעיל
  const activeItemsTotal = activeItems.reduce(
    (sum, item) => sum + (item.price * item.quantity),
    0
  );

  const meetsAmount = activeItemsTotal >= minimumAmount;
  const meetsCount = activeItemsCount >= minimumCount;
  const meetsMinimum = meetsAmount && meetsCount;

  return {
    meetsMinimum,
    meetsAmount,
    meetsCount,
    activeItemsCount,
    activeItemsTotal,
    minimumAmount,
    minimumCount,
    amountDifference: minimumAmount - activeItemsTotal,
    countDifference: minimumCount - activeItemsCount,
    // ✨ NEW: רמת חומרה
    severity: getSeverityLevel(meetsAmount, meetsCount, activeItemsCount, activeItemsTotal, minimumAmount, minimumCount)
  };
}

/**
 * קביעת רמת חומרה
 */
function getSeverityLevel(meetsAmount, meetsCount, activeCount, activeTotal, minAmount, minCount) {
  // אם עומד בשניהם - הכל בסדר
  if (meetsAmount && meetsCount) {
    return 'ok';
  }

  // אם אין פריטים כלל - קריטי
  if (activeCount === 0) {
    return 'critical';
  }

  // אם רק פריט אחד נשאר - גבוה
  if (activeCount === 1 && minCount >= 2) {
    return 'high';
  }

  // אם הסכום קרוב למינימום (בתוך 20%) - בינוני
  const percentageOfMinimum = (activeTotal / minAmount) * 100;
  if (percentageOfMinimum >= 80) {
    return 'medium';
  }

  // אחרת - גבוה
  return 'high';
}

/**
 * יצירת הודעת התראה
 */
export function generateMinimumWarning(checkResult, order) {
  const { meetsMinimum, meetsAmount, meetsCount, severity, activeItemsCount, activeItemsTotal, minimumAmount, minimumCount } = checkResult;

  if (meetsMinimum) {
    return null; // אין צורך בהתראה
  }

  const warnings = [];

  if (!meetsCount) {
    warnings.push(
      `ההזמנה כוללת רק ${activeItemsCount} פריטים (נדרש מינימום ${minimumCount})`
    );
  }

  if (!meetsAmount) {
    warnings.push(
      `סכום ההזמנה הוא ₪${activeItemsTotal.toFixed(2)} (נדרש מינימום ₪${minimumAmount})`
    );
  }

  const severityEmojis = {
    critical: '🚨',
    high: '⚠️',
    medium: '💡',
    ok: '✅'
  };

  return {
    severity,
    emoji: severityEmojis[severity],
    title: 'הזמנה מתחת למינימום',
    message: warnings.join('\n'),
    orderNumber: order.orderNumber,
    orderId: order._id,
    suggestedActions: getSuggestedActions(checkResult, order)
  };
}

/**
 * פעולות מוצעות
 */
function getSuggestedActions(checkResult, order) {
  const { activeItemsCount, meetsAmount, meetsCount } = checkResult;

  const actions = [];

  // אם כל הפריטים בוטלו
  if (activeItemsCount === 0) {
    actions.push({
      action: 'cancel_order',
      label: 'בטל את ההזמנה',
      description: 'כל הפריטים בוטלו, יש לבטל את ההזמנה כולה'
    });
  } else {
    // אם לא עומד בכמות
    if (!meetsCount) {
      actions.push({
        action: 'contact_customer',
        label: 'צור קשר עם הלקוח',
        description: `הצע ללקוח להוסיף עוד ${checkResult.countDifference} פריטים`
      });
    }

    // אם לא עומד בסכום
    if (!meetsAmount) {
      actions.push({
        action: 'suggest_products',
        label: 'הצע מוצרים נוספים',
        description: `הצע ללקוח מוצרים נוספים בסכום של ₪${checkResult.amountDifference.toFixed(2)}`
      });
    }

    // תמיד אפשר לבטל
    actions.push({
      action: 'cancel_and_refund',
      label: 'בטל והחזר כסף',
      description: 'בטל את ההזמנה והחזר את התשלום ללקוח'
    });

    // או להמשיך בכל זאת
    actions.push({
      action: 'continue_anyway',
      label: 'המשך בכל זאת',
      description: 'המשך עם ההזמנה למרות שהיא מתחת למינימום (לא מומלץ)',
      warning: true
    });
  }

  return actions;
}

/**
 * ✨ NEW: בדיקה אוטומטית בעת ביטול פריט
 * נקרא מתוך controller של ביטול פריט
 */
export async function checkAfterCancellation(order) {
  const checkResult = await checkMinimumRequirements(order);

  if (!checkResult.meetsMinimum) {
    const warning = generateMinimumWarning(checkResult, order);

    // ✅ שמור את ההתראה ב-DB (אפשר להוסיף מודל AlertLog)
    console.warn(`⚠️ Order ${order.orderNumber} is below minimum:`, warning);

    // ✅ TODO: שלח התראה למנהל (Email, SMS, Push notification)
    // await sendAdminAlert(warning);

    return {
      belowMinimum: true,
      warning,
      checkResult
    };
  }

  return {
    belowMinimum: false,
    checkResult
  };
}

/**
 * פורמט הודעה מסודרת
 */
export function formatMinimumWarningMessage(warning) {
  if (!warning) return null;

  const lines = [
    `${warning.emoji} ${warning.title}`,
    `הזמנה: #${warning.orderNumber}`,
    '',
    warning.message,
    '',
    'פעולות מוצעות:'
  ];

  warning.suggestedActions.forEach((action, index) => {
    lines.push(`${index + 1}. ${action.label}${action.warning ? ' ⚠️' : ''}`);
    lines.push(`   ${action.description}`);
  });

  return lines.join('\n');
}

export default {
  checkMinimumRequirements,
  generateMinimumWarning,
  checkAfterCancellation,
  formatMinimumWarningMessage
};
