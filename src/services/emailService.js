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

// Base email template with RTL Hebrew support - TORINO Branding
const getBaseTemplate = (content, title) => `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Assistant', 'Segoe UI', Tahoma, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      direction: rtl;
      font-weight: 300;
      letter-spacing: 0.01em;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .email-wrapper {
      width: 100%;
      background-color: #f5f5f5;
      padding: 40px 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .header {
      background-color: #000000;
      color: #ffffff;
      padding: 40px 30px;
      text-align: center;
      border-bottom: 1px solid #e5e5e5;
    }
    .header .logo {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 0.15em;
      margin-bottom: 8px;
    }
    .header .tagline {
      font-size: 13px;
      font-weight: 300;
      letter-spacing: 0.1em;
      color: #cccccc;
      text-transform: uppercase;
    }
    .content {
      padding: 40px 30px;
      line-height: 1.8;
      color: #000000;
      text-align: right;
    }
    .content h2 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 20px;
      letter-spacing: 0.02em;
    }
    .content p {
      margin-bottom: 15px;
      line-height: 1.8;
    }
    .order-box {
      background-color: #f8f8f8;
      padding: 25px;
      margin: 25px 0;
      border-right: 3px solid #000000;
    }
    .order-number {
      font-size: 28px;
      font-weight: 700;
      color: #000000;
      letter-spacing: 0.05em;
      margin: 10px 0;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 25px 0;
      text-align: right;
    }
    .items-table th {
      background-color: #000000;
      color: #ffffff;
      padding: 15px 12px;
      font-weight: 600;
      font-size: 14px;
      letter-spacing: 0.05em;
      text-align: right;
    }
    .items-table td {
      padding: 15px 12px;
      border-bottom: 1px solid #e5e5e5;
      text-align: right;
    }
    .total-row {
      font-weight: 600;
      font-size: 18px;
      background-color: #f8f8f8 !important;
      border-top: 2px solid #000000 !important;
    }
    .button {
      display: inline-block;
      background-color: #000000;
      color: #ffffff !important;
      padding: 16px 40px;
      text-decoration: none;
      font-weight: 600;
      margin: 25px 0;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-size: 14px;
      transition: background-color 0.3s ease;
    }
    .button:hover {
      background-color: #333333;
    }
    .footer {
      background-color: #000000;
      color: #ffffff;
      padding: 30px;
      text-align: center;
      font-size: 13px;
      letter-spacing: 0.05em;
    }
    .footer a {
      color: #ffffff;
      text-decoration: none;
      border-bottom: 1px solid #ffffff;
    }
    .status-badge {
      display: inline-block;
      padding: 8px 20px;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-confirmed { background: #d1fae5; color: #065f46; }
    .status-in_progress { background: #dbeafe; color: #1e40af; }
    .status-ready_to_ship { background: #e0e7ff; color: #4338ca; }
    .status-shipped { background: #dbeafe; color: #1e40af; }
    .status-delivered { background: #d1fae5; color: #065f46; }
    .status-cancelled { background: #fee2e2; color: #991b1b; }
    .address-box {
      background-color: #f8f8f8;
      padding: 20px;
      margin: 20px 0;
      border-right: 2px solid #cccccc;
      line-height: 1.8;
    }
    .highlight {
      color: #000000;
      font-weight: 600;
    }
    .divider {
      border: 0;
      height: 1px;
      background-color: #e5e5e5;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">TORINO</div>
        <div class="tagline">יבוא אישי של מותגי אופנה יוקרתיים</div>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p style="margin-bottom: 10px;">
          <a href="mailto:${process.env.EMAIL_FROM_ADDRESS || 'torino900100@gmail.com'}">${process.env.EMAIL_FROM_ADDRESS || 'torino900100@gmail.com'}</a>
        </p>
        <p style="font-weight: 300;">© ${new Date().getFullYear()} TORINO - כל הזכויות שמורות</p>
      </div>
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
    <h2>תודה על ההזמנה</h2>
    <p>שלום <strong>${order.shippingAddress?.fullName || order.user?.firstName || 'לקוח יקר'}</strong>,</p>
    <p>קיבלנו את הזמנתך ואנו מתחילים לטפל בה.</p>

    <div class="order-box">
      <p style="margin-bottom: 5px; font-weight: 600;">מספר הזמנה</p>
      <p class="order-number">${order.orderNumber}</p>
      <p style="margin-top: 10px; color: #666;">${formatDate(order.createdAt)}</p>
    </div>

    <h3 style="margin-top: 30px; margin-bottom: 20px;">פרטי ההזמנה</h3>
    ${generateItemsTable(order.items)}

    <div class="order-box">
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid #e5e5e5;">
          <td style="padding: 10px 0;">סכום ביניים</td>
          <td style="padding: 10px 0; text-align: left;">${formatCurrency(order.pricing?.subtotal || 0)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e5e5;">
          <td style="padding: 10px 0;">משלוח</td>
          <td style="padding: 10px 0; text-align: left;">${formatCurrency(order.pricing?.shipping || 0)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e5e5;">
          <td style="padding: 10px 0;">מע״מ</td>
          <td style="padding: 10px 0; text-align: left;">${formatCurrency(order.pricing?.tax || 0)}</td>
        </tr>
        <tr class="total-row">
          <td style="padding: 15px 0;"><strong>סה״כ לתשלום</strong></td>
          <td style="padding: 15px 0; text-align: left;"><strong>${formatCurrency(order.pricing?.total || 0)}</strong></td>
        </tr>
      </table>
    </div>

    <h3 style="margin-top: 30px; margin-bottom: 15px;">כתובת למשלוח</h3>
    <div class="address-box">
      <p style="margin-bottom: 5px;"><strong>${order.shippingAddress?.fullName || ''}</strong></p>
      <p style="margin-bottom: 3px;">${order.shippingAddress?.street || ''}</p>
      <p style="margin-bottom: 3px;">${order.shippingAddress?.city || ''} ${order.shippingAddress?.zipCode || ''}</p>
      <p>טלפון: ${order.shippingAddress?.phone || ''}</p>
    </div>

    <hr class="divider">

    <p style="text-align: center;">נעדכן אותך ברגע שההזמנה תצא לדרך</p>

    <center>
      <a href="https://www.torinoil.com/orders/${order._id}" class="button">צפייה בהזמנה</a>
    </center>
  `;

  return getBaseTemplate(content, `אישור הזמנה #${order.orderNumber}`);
};

// 2. Payment Charged Confirmation
export const getPaymentChargedTemplate = (order) => {
  const content = `
    <h2>אישור תשלום</h2>
    <p>שלום <strong>${order.shippingAddress?.fullName || order.user?.firstName || 'לקוח יקר'}</strong>,</p>
    <p>התשלום עבור הזמנתך התקבל בהצלחה.</p>

    <div class="order-box">
      <p style="margin-bottom: 5px; font-weight: 600;">מספר הזמנה</p>
      <p class="order-number">${order.orderNumber}</p>
      <p style="margin-top: 15px;">סכום ששולם: <span class="highlight">${formatCurrency(order.payment?.chargedAmount || order.pricing?.total || 0)}</span></p>
      <p style="margin-top: 5px; color: #666;">${formatDate(order.payment?.chargedAt || new Date())}</p>
    </div>

    <h3 style="margin-top: 30px; margin-bottom: 20px;">פרטי ההזמנה</h3>
    ${generateItemsTable(order.items.filter(item => item.itemStatus !== 'cancelled'))}

    ${order.payment?.refundedAmount > 0 ? `
    <div class="order-box" style="border-right-color: #d97706;">
      <p style="font-weight: 600; margin-bottom: 10px;">זיכוי</p>
      <p>סכום זיכוי: ${formatCurrency(order.payment.refundedAmount)}</p>
      <p style="margin-top: 10px;">סכום ששולם בפועל: ${formatCurrency((order.payment?.chargedAmount || 0) - (order.payment?.refundedAmount || 0))}</p>
    </div>
    ` : ''}

    <hr class="divider">

    <p style="text-align: center;">ההזמנה בדרך אליך. נעדכן אותך כשתצא למשלוח.</p>

    <center>
      <a href="https://www.torinoil.com/orders/${order._id}" class="button">צפייה בהזמנה</a>
    </center>

    <p style="text-align: center; margin-top: 30px;">תודה שבחרת ב-TORINO</p>
  `;

  return getBaseTemplate(content, `אישור תשלום - הזמנה #${order.orderNumber}`);
};

// 3. Delivery Confirmation
export const getDeliveryConfirmationTemplate = (order) => {
  const content = `
    <h2>אישור משלוח</h2>
    <p>שלום <strong>${order.shippingAddress?.fullName || order.user?.firstName || 'לקוח יקר'}</strong>,</p>
    <p>הזמנתך נמסרה בהצלחה.</p>

    <div class="order-box">
      <p style="margin-bottom: 5px; font-weight: 600;">מספר הזמנה</p>
      <p class="order-number">${order.orderNumber}</p>
      <p style="margin-top: 15px;"><span class="status-badge status-delivered">נמסר</span></p>
      <p style="margin-top: 10px; color: #666;">${formatDate(order.shipping?.deliveredAt || new Date())}</p>
    </div>

    <h3 style="margin-top: 30px; margin-bottom: 20px;">פרטי ההזמנה</h3>
    ${generateItemsTable(order.items.filter(item => item.itemStatus === 'delivered'))}

    <div class="address-box">
      <p style="font-weight: 600; margin-bottom: 10px;">נמסר לכתובת</p>
      <p style="margin-bottom: 3px;">${order.shippingAddress?.fullName || ''}</p>
      <p style="margin-bottom: 3px;">${order.shippingAddress?.street || ''}</p>
      <p>${order.shippingAddress?.city || ''}</p>
    </div>

    <hr class="divider">

    <p style="text-align: center;">מקווים שתהנה מהמוצרים</p>

    <center>
      <a href="https://www.torinoil.com/orders/${order._id}" class="button">צפייה בהזמנה</a>
    </center>

    <p style="text-align: center; margin-top: 30px;">תודה שבחרת ב-TORINO</p>
  `;

  return getBaseTemplate(content, `ההזמנה נמסרה - #${order.orderNumber}`);
};

// 4. Custom Marketing Email (for admin to send)
export const getCustomEmailTemplate = (subject, body, order = null) => {
  let orderSection = '';

  if (order) {
    orderSection = `
      <div class="order-box">
        <p style="margin-bottom: 5px; font-weight: 600;">בהקשר להזמנה</p>
        <p class="order-number">${order.orderNumber}</p>
        <p style="margin-top: 10px; color: #666;">${formatDate(order.createdAt)}</p>
        <p style="margin-top: 10px;"><span class="status-badge status-${order.status}">${getStatusText(order.status)}</span></p>
      </div>
    `;
  }

  const content = `
    ${body.split('\n').map(line => `<p style="margin-bottom: 15px;">${line}</p>`).join('')}

    ${orderSection}

    <hr class="divider">

    <p style="text-align: center;">בברכה,<br><strong>צוות TORINO</strong></p>
  `;

  return getBaseTemplate(content, subject);
};

// 5. Order Status Update Email
export const getOrderStatusUpdateTemplate = (order, newStatus, message = '') => {
  const statusMessages = {
    'pending': 'ההזמנה התקבלה ואנו מתחילים לטפל בה',
    'in_progress': 'ההזמנה בטיפול',
    'ready_to_ship': 'ההזמנה מוכנה ליציאה למשלוח',
    'shipped': 'ההזמנה בדרך אליך',
    'delivered': 'ההזמנה נמסרה בהצלחה',
    'cancelled': 'ההזמנה בוטלה'
  };

  const content = `
    <h2>עדכון הזמנה</h2>
    <p>שלום <strong>${order.shippingAddress?.fullName || order.user?.firstName || 'לקוח יקר'}</strong>,</p>
    <p>${statusMessages[newStatus] || 'יש עדכון בהזמנתך'}</p>

    <div class="order-box">
      <p style="margin-bottom: 5px; font-weight: 600;">מספר הזמנה</p>
      <p class="order-number">${order.orderNumber}</p>
      <p style="margin-top: 15px;"><span class="status-badge status-${newStatus}">${getStatusText(newStatus)}</span></p>
    </div>

    ${message ? `<div class="address-box"><p style="font-weight: 600; margin-bottom: 10px;">הערה</p><p>${message}</p></div>` : ''}

    ${order.shipping?.trackingNumber ? `
    <div class="address-box">
      <p style="font-weight: 600; margin-bottom: 10px;">מעקב משלוח</p>
      <p style="margin-bottom: 5px;">מספר מעקב: <strong>${order.shipping.trackingNumber}</strong></p>
      <p>חברת משלוח: ${order.shipping.carrier || 'לא צוין'}</p>
    </div>
    ` : ''}

    <center>
      <a href="https://www.torinoil.com/orders/${order._id}" class="button">צפייה בהזמנה</a>
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
