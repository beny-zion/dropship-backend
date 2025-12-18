/**
 * Hyp Pay HTTP Client
 *
 * מטפל בכל התקשורת עם Hyp Pay API
 * תומך ב: hold (postpone), capture (commit), cancel, query
 */

import axios from 'axios';

/**
 * קריאת משתני סביבה בזמן ריצה (לא בזמן import)
 * זה מאפשר לטסטים לטעון את .env לפני השימוש
 */
function getConfig() {
  return {
    HYP_API_URL: process.env.HYP_API_URL || 'https://pay.hyp.co.il/p/',
    HYP_MASOF: process.env.HYP_MASOF,
    HYP_PASSP: process.env.HYP_PASSP,
    HYP_TEST_MODE: process.env.HYP_TEST_MODE === 'true'
  };
}

/**
 * שליחת בקשה ל-Hyp Pay
 *
 * @param {Object} params - פרמטרים לשליחה
 * @returns {Promise<Object>} תשובה מפוענחת
 */
async function sendRequest(params) {
  const config = getConfig();

  // ולידציה
  if (!config.HYP_MASOF || !config.HYP_PASSP) {
    throw new Error('Hyp Pay credentials not configured. Check HYP_MASOF and HYP_PASSP in .env');
  }

  // הוספת פרמטרים חובה
  const fullParams = {
    Masof: config.HYP_MASOF,
    PassP: config.HYP_PASSP,
    UTF8: 'True',
    UTF8out: 'True',
    ...params
  };

  // Log בפיתוח
  if (config.HYP_TEST_MODE) {
    console.log('🔵 Hyp Pay Request:', {
      action: params.action,
      amount: params.Amount,
      order: params.Order,
      postpone: params.Postpone
    });
  }

  try {
    // יצירת FormData (Hyp Pay מצפה ל-form-urlencoded)
    const formData = new URLSearchParams();
    Object.keys(fullParams).forEach(key => {
      if (fullParams[key] !== undefined && fullParams[key] !== null) {
        formData.append(key, fullParams[key].toString());
      }
    });

    const response = await axios.post(config.HYP_API_URL, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 30000 // 30 seconds
    });

    const result = parseHypResponse(response.data);

    // Log בפיתוח
    if (config.HYP_TEST_MODE) {
      console.log('🟢 Hyp Pay Response:', {
        CCode: result.CCode,
        success: isSuccessCode(result.CCode, params.action),
        Id: result.Id
      });
    }

    return result;

  } catch (error) {
    console.error('❌ Hyp Pay Error:', error.message);

    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }

    throw new Error(`Hyp Pay request failed: ${error.message}`);
  }
}

/**
 * פענוח תשובה מ-Hyp Pay
 * Hyp Pay מחזיר URL-encoded string
 *
 * @param {String} responseText
 * @returns {Object}
 */
function parseHypResponse(responseText) {
  const params = new URLSearchParams(responseText);
  const result = {};

  for (const [key, value] of params) {
    result[key] = value;
  }

  return result;
}

/**
 * בדיקת קוד הצלחה
 * קודי הצלחה שונים לפעולות שונות
 *
 * @param {String} code - קוד תשובה מ-Hyp Pay
 * @param {String} action - סוג הפעולה
 * @returns {Boolean}
 */
function isSuccessCode(code, action) {
  // קודי הצלחה כלליים
  const generalSuccessCodes = ['0'];

  // קודים ספציפיים לפעולות
  const actionSpecificCodes = {
    'soft': ['0', '800'],           // hold - 800 = עסקה מושהית
    'commitTrans': ['0', '250'],    // capture - 250 = גביה מוצלחת (עם אזהרה קלה)
    'CancelTrans': ['0'],           // cancel
    'QueryTrans': ['0'],            // query
    'cancelOrder': ['0']            // cancel order
  };

  const validCodes = actionSpecificCodes[action] || generalSuccessCodes;
  return validCodes.includes(code);
}

/**
 * פענוח הודעת שגיאה
 *
 * @param {Object} result - תשובה מ-Hyp Pay
 * @returns {String} הודעת שגיאה בעברית
 */
function getErrorMessage(result) {
  // אם יש הודעת שגיאה מפורשת
  if (result.errMsg) {
    return result.errMsg;
  }

  // מיפוי קודי שגיאה נפוצים
  const errorMessages = {
    '1': 'כרטיס חסום',
    '2': 'כרטיס גנוב',
    '3': 'פנה לחברת האשראי',
    '4': 'סירוב',
    '5': 'כרטיס מזויף',
    '6': 'תקלה בתקשורת',
    '7': 'CVV שגוי',
    '33': 'כרטיס לא תקין',
    '36': 'תוקף כרטיס פג',
    '39': 'שגיאה בפרטי הכרטיס',
    '51': 'אין כיסוי',
    '54': 'תוקף הכרטיס פג',
    '57': 'פעולה לא מותרת לכרטיס זה',
    '58': 'פעולה לא מותרת למסוף',
    '61': 'סכום חורג ממגבלת המסגרת',
    '62': 'כרטיס מוגבל',
    '65': 'חריגה ממספר עסקאות מותר',
    '75': 'CVV שגוי - נסה שוב',
    '79': 'כרטיס לא בשימוש',
    '96': 'תקלה במערכת',
    '250': 'גביה מוצלחת (עם אזהרה)' // Not actually an error - success with warning
  };

  return errorMessages[result.CCode] || `שגיאה לא ידועה (קוד: ${result.CCode})`;
}

/**
 * ולידציה של פרטי כרטיס אשראי
 *
 * @param {Object} cardDetails
 * @returns {Object} { valid: Boolean, errors: Array }
 */
function validateCardDetails(cardDetails) {
  const errors = [];

  // מספר כרטיס
  if (!cardDetails.cardNumber || !/^\d{13,19}$/.test(cardDetails.cardNumber.replace(/\s/g, ''))) {
    errors.push('מספר כרטיס לא תקין');
  }

  // חודש תוקף
  if (!cardDetails.expMonth || !/^(0[1-9]|1[0-2])$/.test(cardDetails.expMonth)) {
    errors.push('חודש תוקף לא תקין');
  }

  // שנת תוקף
  if (!cardDetails.expYear || !/^\d{2}$/.test(cardDetails.expYear)) {
    errors.push('שנת תוקף לא תקינה');
  }

  // CVV
  if (!cardDetails.cvv || !/^\d{3,4}$/.test(cardDetails.cvv)) {
    errors.push('CVV לא תקין');
  }

  // ת.ז.
  if (!cardDetails.userId || cardDetails.userId.length < 5) {
    errors.push('תעודת זהות לא תקינה');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export {
  sendRequest,
  parseHypResponse,
  isSuccessCode,
  getErrorMessage,
  validateCardDetails,
  getConfig
};

export default {
  sendRequest,
  parseHypResponse,
  isSuccessCode,
  getErrorMessage,
  validateCardDetails,
  getConfig
};
