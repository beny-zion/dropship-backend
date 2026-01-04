/**
 * HyPay Signature Verification
 *
 * אימות חתימה דיגיטלית של callbacks מ-HyPay
 * מבוסס על APISign protocol - https://hypay.docs.apiary.io
 */

import axios from 'axios';

/**
 * אימות Signature מ-HyPay
 *
 * תהליך האימות:
 * 1. HyPay שולח callback עם פרמטר Sign (חתימה דיגיטלית)
 * 2. אנחנו שולחים את כל הפרמטרים חזרה ל-HyPay עם action=APISign&What=VERIFY
 * 3. HyPay מחזיר CCode=0 אם החתימה תקינה, CCode=902 אם לא
 *
 * @param {Object} callbackParams - כל הפרמטרים שחזרו מ-HyPay (req.query)
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function verifyHyPaySignature(callbackParams) {
  try {
    const config = getConfig();

    // ולידציה - חובה שיהיה Sign parameter
    if (!callbackParams.Sign) {
      console.warn('[HyPay Signature] No Sign parameter in callback - signature verification not enabled?');
      return {
        valid: false,
        error: 'Missing signature parameter'
      };
    }

    // Mock mode - דלג על אימות
    if (config.HYP_MOCK_MODE) {
      console.log('🟡 MOCK MODE: Skipping signature verification');
      return { valid: true };
    }

    // ולידציה - חובה שיהיה API Key
    if (!config.HYP_API_KEY) {
      console.error('[HyPay Signature] Missing HYP_API_KEY in environment variables');
      return {
        valid: false,
        error: 'Missing API Key configuration'
      };
    }

    // בנה URL לאימות
    const verifyParams = {
      action: 'APISign',
      What: 'VERIFY',
      KEY: config.HYP_API_KEY,
      PassP: config.HYP_PASSP,
      Masof: config.HYP_MASOF,
      ...callbackParams  // כל הפרמטרים מה-callback כולל Sign
    };

    const queryString = new URLSearchParams(verifyParams).toString();
    const verifyUrl = `${config.HYP_API_URL}?${queryString}`;

    console.log('[HyPay Signature] Verifying signature for Order:', callbackParams.Order || 'N/A');

    // שלח בקשת אימות ל-HyPay
    const response = await axios.get(verifyUrl, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // Debug: הדפס את התשובה המלאה
    console.log('[HyPay Signature] Raw response type:', typeof response.data);
    console.log('[HyPay Signature] Raw response:', response.data);

    // Parse תשובה (HyPay מחזיר URL-encoded string)
    const result = new URLSearchParams(response.data);
    const ccode = String(result.get('CCode') || '');  // המרה ל-string

    console.log(`[HyPay Signature] Parsed CCode: "${ccode}" (type: ${typeof ccode})`);

    if (ccode === '0') {
      console.log('✅ [HyPay Signature] Verification SUCCESS for Order:', callbackParams.Order);
      return { valid: true };
    } else if (ccode === '902') {
      console.error('❌ [HyPay Signature] Authentication error - CCode: 902');
      return {
        valid: false,
        error: 'Authentication error - signature verification failed'
      };
    } else {
      console.error(`❌ [HyPay Signature] Verification FAILED - CCode: ${ccode}`);
      return {
        valid: false,
        error: `Verification failed with code ${ccode}`
      };
    }

  } catch (error) {
    console.error('❌ [HyPay Signature] Verification error:', error.message);

    // אם יש בעיית תקשורת - לא נכשיל את התשלום אבל נזהיר
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      console.warn('⚠️ [HyPay Signature] Timeout - proceeding with caution');
      // במצב production כדאי לדחות, אבל לא להכשיל לחלוטין
    }

    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * קריאת הגדרות סביבה
 */
function getConfig() {
  return {
    HYP_API_URL: process.env.HYP_API_URL || 'https://pay.hyp.co.il/p/',
    HYP_MASOF: process.env.HYP_MASOF,
    HYP_PASSP: process.env.HYP_PASSP,
    HYP_API_KEY: process.env.HYP_API_KEY,
    HYP_MOCK_MODE: process.env.HYP_MOCK_MODE === 'true'
  };
}

export default {
  verifyHyPaySignature
};
