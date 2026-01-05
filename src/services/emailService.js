import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * הגדרת לקוח OAuth2 עבור Gmail API
 */
const getOAuth2Client = () => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
  });

  return oauth2Client;
};

/**
 * אימות תקינות החיבור ל-API
 */
export const verifyEmailConfig = async () => {
  try {
    if (!process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN === 'YOUR_GMAIL_REFRESH_TOKEN') {
      console.log('⚠️ Gmail API not configured - Missing Refresh Token');
      return false;
    }

    const auth = getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    // בדיקה פשוטה מול הפרופיל של המשתמש כדי לוודא שהטוקן עובד
    await gmail.users.getProfile({ userId: 'me' });

    console.log('📧 Email service is ready (Gmail API via HTTPS)');
    return true;
  } catch (error) {
    console.error('❌ Email service API error:', error.message);
    return false;
  }
};

/**
 * פונקציה פנימית ליצירת המייל בפורמט שגוגל דורשת (Base64url)
 */
const createRawMessage = (to, subject, html) => {
  const fromName = process.env.EMAIL_FROM_NAME || 'Torino Shop';
  const fromEmail = process.env.GMAIL_USER;

  // קידוד נושא המייל לעברית (UTF-8)
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

  const str = [
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    `Content-Transfer-Encoding: 7bit`,
    `to: ${to}`,
    `from: "${fromName}" <${fromEmail}>`,
    `subject: ${utf8Subject}`,
    `\n`,
    html
  ].join('\n');

  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/**
 * שליחת מייל בודד
 */
export const sendEmail = async (to, subject, html) => {
  try {
    // Check if email is configured
    if (!process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN === 'YOUR_GMAIL_REFRESH_TOKEN') {
      console.log('⚠️ Email not sent - Gmail API not configured');
      return { success: false, error: 'Gmail API not configured' };
    }

    const auth = getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    const raw = createRawMessage(to, subject, html);

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: raw
      }
    });

    console.log(`📧 Email sent to ${to}. Message ID: ${res.data.id}`);
    return { success: true, messageId: res.data.id };
  } catch (error) {
    console.error('❌ Gmail API Send Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

// Base email template with RTL Hebrew support
const getBaseTemplate = (content, title) => `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f4f4f4;
      direction: rtl;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #1a365d 0%, #2d4a7c 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .header .logo {
      font-size: 32px;
      margin-bottom: 10px;
    }
    .content {
      padding: 30px;
      line-height: 1.8;
      color: #333;
    }
    .order-box {
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      border-right: 4px solid #1a365d;
    }
    .order-number {
      font-size: 24px;
      font-weight: bold;
      color: #1a365d;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .items-table th, .items-table td {
      padding: 12px;
      text-align: right;
      border-bottom: 1px solid #eee;
    }
    .items-table th {
      background-color: #f8f9fa;
      font-weight: 600;
    }
    .total-row {
      font-weight: bold;
      font-size: 18px;
      background-color: #e8f4f8 !important;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #1a365d 0%, #2d4a7c 100%);
      color: white !important;
      padding: 14px 30px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: bold;
      margin: 20px 0;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #666;
      font-size: 14px;
      border-top: 1px solid #eee;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 14px;
    }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-confirmed { background: #d1fae5; color: #065f46; }
    .status-shipped { background: #dbeafe; color: #1e40af; }
    .status-delivered { background: #d1fae5; color: #065f46; }
    .address-box {
      background-color: #f0f9ff;
      border-radius: 8px;
      padding: 15px;
      margin: 15px 0;
    }
    .highlight {
      color: #1a365d;
      font-weight: bold;
    }
    .divider {
      border: 0;
      height: 1px;
      background: linear-gradient(to right, transparent, #ccc, transparent);
      margin: 25px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🛒</div>
      <h1>${process.env.EMAIL_FROM_NAME || 'Torino Shop'}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>📧 ${process.env.EMAIL_FROM_ADDRESS || 'torino900100@gmail.com'}</p>
      <p>© ${new Date().getFullYear()} ${process.env.EMAIL_FROM_NAME || 'Torino Shop'} - כל הזכויות שמורות</p>
    </div>
  </div>
</body>
</html>
`;

// Format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS'
  }).format(amount);
};

// Format date
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Generate order items table HTML
const generateItemsTable = (items) => {
  let rows = items.map(item => `
    <tr>
      <td>${item.name || item.product?.name_he || 'מוצר'}</td>
      <td>${item.quantity}</td>
      <td>${formatCurrency(item.price)}</td>
      <td>${formatCurrency(item.price * item.quantity)}</td>
    </tr>
  `).join('');

  return `
    <table class="items-table">
      <thead>
        <tr>
          <th>מוצר</th>
          <th>כמות</th>
          <th>מחיר ליחידה</th>
          <th>סה"כ</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
};

// Status text helper
const getStatusText = (status) => {
  const statusMap = {
    'awaiting_payment': 'ממתין לתשלום',
    'pending': 'ממתין לטיפול',
    'in_progress': 'בטיפול',
    'ready_to_ship': 'מוכן למשלוח',
    'shipped': 'נשלח',
    'delivered': 'נמסר',
    'cancelled': 'בוטל'
  };
  return statusMap[status] || status;
};

// Email Templates

// 1. Order Confirmation (on order creation)
export const getOrderConfirmationTemplate = (order) => {
  const content = `
    <h2>🎉 תודה על ההזמנה שלך!</h2>
    <p>שלום <strong>${order.shippingAddress?.fullName || order.user?.firstName || 'לקוח יקר'}</strong>,</p>
    <p>קיבלנו את ההזמנה שלך ואנחנו מתחילים לטפל בה.</p>

    <div class="order-box">
      <p>מספר הזמנה:</p>
      <p class="order-number">${order.orderNumber}</p>
      <p>תאריך: ${formatDate(order.createdAt)}</p>
    </div>

    <h3>📦 פרטי ההזמנה</h3>
    ${generateItemsTable(order.items)}

    <div class="order-box">
      <table style="width: 100%;">
        <tr>
          <td>סכום ביניים:</td>
          <td style="text-align: left;">${formatCurrency(order.pricing?.subtotal || 0)}</td>
        </tr>
        <tr>
          <td>משלוח:</td>
          <td style="text-align: left;">${formatCurrency(order.pricing?.shipping || 0)}</td>
        </tr>
        <tr>
          <td>מע"מ:</td>
          <td style="text-align: left;">${formatCurrency(order.pricing?.tax || 0)}</td>
        </tr>
        <tr class="total-row">
          <td><strong>סה"כ לתשלום:</strong></td>
          <td style="text-align: left;"><strong>${formatCurrency(order.pricing?.total || 0)}</strong></td>
        </tr>
      </table>
    </div>

    <h3>📍 כתובת למשלוח</h3>
    <div class="address-box">
      <p><strong>${order.shippingAddress?.fullName || ''}</strong></p>
      <p>${order.shippingAddress?.street || ''}</p>
      <p>${order.shippingAddress?.city || ''} ${order.shippingAddress?.zipCode || ''}</p>
      <p>טלפון: ${order.shippingAddress?.phone || ''}</p>
    </div>

    <hr class="divider">

    <p>אנחנו נשלח לך עדכון ברגע שההזמנה תצא לדרך!</p>

    <center>
      <a href="${process.env.SITE_URL}/orders/${order._id}" class="button">צפייה בהזמנה</a>
    </center>

    <p>יש שאלות? אנחנו כאן בשבילך! 💬</p>
  `;

  return getBaseTemplate(content, `אישור הזמנה #${order.orderNumber}`);
};

// 2. Payment Charged Confirmation
export const getPaymentChargedTemplate = (order) => {
  const content = `
    <h2>✅ התשלום בוצע בהצלחה!</h2>
    <p>שלום <strong>${order.shippingAddress?.fullName || order.user?.firstName || 'לקוח יקר'}</strong>,</p>
    <p>התשלום עבור ההזמנה שלך התקבל בהצלחה.</p>

    <div class="order-box">
      <p>מספר הזמנה:</p>
      <p class="order-number">${order.orderNumber}</p>
      <p>סכום ששולם: <span class="highlight">${formatCurrency(order.payment?.chargedAmount || order.pricing?.total || 0)}</span></p>
      <p>תאריך חיוב: ${formatDate(order.payment?.chargedAt || new Date())}</p>
    </div>

    <h3>📦 פרטי ההזמנה</h3>
    ${generateItemsTable(order.items.filter(item => item.itemStatus !== 'cancelled'))}

    ${order.payment?.refundedAmount > 0 ? `
    <div class="order-box" style="border-right-color: #f59e0b;">
      <p>💰 <strong>זיכוי:</strong> ${formatCurrency(order.payment.refundedAmount)}</p>
      <p>סכום ששולם בפועל: ${formatCurrency((order.payment?.chargedAmount || 0) - (order.payment?.refundedAmount || 0))}</p>
    </div>
    ` : ''}

    <hr class="divider">

    <p>ההזמנה שלך בדרך אליך! נעדכן אותך כשהיא תצא למשלוח.</p>

    <center>
      <a href="${process.env.SITE_URL}/orders/${order._id}" class="button">צפייה בהזמנה</a>
    </center>

    <p>תודה שקנית אצלנו! 🙏</p>
  `;

  return getBaseTemplate(content, `אישור תשלום - הזמנה #${order.orderNumber}`);
};

// 3. Delivery Confirmation
export const getDeliveryConfirmationTemplate = (order) => {
  const content = `
    <h2>🎊 ההזמנה שלך נמסרה!</h2>
    <p>שלום <strong>${order.shippingAddress?.fullName || order.user?.firstName || 'לקוח יקר'}</strong>,</p>
    <p>אנחנו שמחים לבשר לך שההזמנה שלך נמסרה בהצלחה!</p>

    <div class="order-box">
      <p>מספר הזמנה:</p>
      <p class="order-number">${order.orderNumber}</p>
      <p><span class="status-badge status-delivered">✓ נמסר</span></p>
      <p>תאריך מסירה: ${formatDate(order.shipping?.deliveredAt || new Date())}</p>
    </div>

    <h3>📦 מה הוזמן</h3>
    ${generateItemsTable(order.items.filter(item => item.itemStatus === 'delivered'))}

    <div class="address-box">
      <p>📍 <strong>נמסר ל:</strong></p>
      <p>${order.shippingAddress?.fullName || ''}</p>
      <p>${order.shippingAddress?.street || ''}, ${order.shippingAddress?.city || ''}</p>
    </div>

    <hr class="divider">

    <p>מקווים שתהנה מהמוצרים! 😊</p>
    <p>נשמח לשמוע את דעתך - ביקורות עוזרות ללקוחות אחרים לבחור.</p>

    <center>
      <a href="${process.env.SITE_URL}/orders/${order._id}" class="button">צפייה בהזמנה</a>
    </center>

    <p>תודה שבחרת בנו! נשמח לראותך שוב 💙</p>
  `;

  return getBaseTemplate(content, `ההזמנה נמסרה - #${order.orderNumber}`);
};

// 4. Custom Marketing Email (for admin to send)
export const getCustomEmailTemplate = (subject, body, order = null) => {
  let orderSection = '';

  if (order) {
    orderSection = `
      <div class="order-box">
        <p>בהקשר להזמנה:</p>
        <p class="order-number">${order.orderNumber}</p>
        <p>מתאריך: ${formatDate(order.createdAt)}</p>
        <p>סטטוס: <span class="status-badge status-${order.status}">${getStatusText(order.status)}</span></p>
      </div>
    `;
  }

  const content = `
    ${body.split('\n').map(line => `<p>${line}</p>`).join('')}

    ${orderSection}

    <hr class="divider">

    <p>בברכה,<br>צוות ${process.env.EMAIL_FROM_NAME || 'Torino Shop'}</p>
  `;

  return getBaseTemplate(content, subject);
};

// 5. Order Status Update Email
export const getOrderStatusUpdateTemplate = (order, newStatus, message = '') => {
  const statusMessages = {
    'pending': 'ההזמנה התקבלה ואנחנו מתחילים לטפל בה',
    'in_progress': 'ההזמנה שלך בטיפול',
    'ready_to_ship': 'ההזמנה מוכנה ויוצאת למשלוח בקרוב',
    'shipped': 'ההזמנה שלך בדרך אליך! 🚚',
    'delivered': 'ההזמנה נמסרה בהצלחה!',
    'cancelled': 'ההזמנה בוטלה'
  };

  const content = `
    <h2>📋 עדכון סטטוס הזמנה</h2>
    <p>שלום <strong>${order.shippingAddress?.fullName || order.user?.firstName || 'לקוח יקר'}</strong>,</p>
    <p>${statusMessages[newStatus] || 'יש עדכון בהזמנה שלך'}</p>

    <div class="order-box">
      <p>מספר הזמנה:</p>
      <p class="order-number">${order.orderNumber}</p>
      <p>סטטוס חדש: <span class="status-badge status-${newStatus}">${getStatusText(newStatus)}</span></p>
    </div>

    ${message ? `<p><strong>הערה:</strong> ${message}</p>` : ''}

    ${order.shipping?.trackingNumber ? `
    <div class="address-box">
      <p>📦 <strong>מספר מעקב:</strong> ${order.shipping.trackingNumber}</p>
      <p>חברת משלוח: ${order.shipping.carrier || 'לא צוין'}</p>
    </div>
    ` : ''}

    <center>
      <a href="${process.env.SITE_URL}/orders/${order._id}" class="button">צפייה בהזמנה</a>
    </center>
  `;

  return getBaseTemplate(content, `עדכון הזמנה #${order.orderNumber}`);
};

// High-level email sending functions

// Send order confirmation
export const sendOrderConfirmation = async (order) => {
  const email = order.shippingAddress?.email || order.user?.email;
  if (!email) {
    console.log('⚠️ No email address for order confirmation');
    return { success: false, error: 'No email address' };
  }

  const html = getOrderConfirmationTemplate(order);
  return await sendEmail(email, `אישור הזמנה #${order.orderNumber}`, html);
};

// Send payment charged confirmation
export const sendPaymentChargedConfirmation = async (order) => {
  const email = order.shippingAddress?.email || order.user?.email;
  if (!email) {
    console.log('⚠️ No email address for payment confirmation');
    return { success: false, error: 'No email address' };
  }

  const html = getPaymentChargedTemplate(order);
  return await sendEmail(email, `אישור תשלום - הזמנה #${order.orderNumber}`, html);
};

// Send delivery confirmation
export const sendDeliveryConfirmation = async (order) => {
  const email = order.shippingAddress?.email || order.user?.email;
  if (!email) {
    console.log('⚠️ No email address for delivery confirmation');
    return { success: false, error: 'No email address' };
  }

  const html = getDeliveryConfirmationTemplate(order);
  return await sendEmail(email, `ההזמנה נמסרה! #${order.orderNumber}`, html);
};

// Send status update
export const sendStatusUpdate = async (order, newStatus, message = '') => {
  const email = order.shippingAddress?.email || order.user?.email;
  if (!email) {
    console.log('⚠️ No email address for status update');
    return { success: false, error: 'No email address' };
  }

  const html = getOrderStatusUpdateTemplate(order, newStatus, message);
  return await sendEmail(email, `עדכון הזמנה #${order.orderNumber}`, html);
};

// Send custom email (admin)
export const sendCustomEmail = async (to, subject, body, order = null) => {
  const html = getCustomEmailTemplate(subject, body, order);
  return await sendEmail(to, subject, html);
};

// Send bulk emails
export const sendBulkEmails = async (recipients, subject, body, order = null) => {
  const results = [];

  for (const email of recipients) {
    const result = await sendCustomEmail(email, subject, body, order);
    results.push({ email, ...result });

    // Small delay between emails to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
};

export default {
  verifyEmailConfig,
  sendEmail,
  sendOrderConfirmation,
  sendPaymentChargedConfirmation,
  sendDeliveryConfirmation,
  sendStatusUpdate,
  sendCustomEmail,
  sendBulkEmails,
  getOrderConfirmationTemplate,
  getPaymentChargedTemplate,
  getDeliveryConfirmationTemplate,
  getCustomEmailTemplate,
  getOrderStatusUpdateTemplate
};
