/**
 * Gmail OAuth2 Refresh Token Generator
 *
 * שלבים להשגת Refresh Token:
 *
 * 1. לך ל-Google Cloud Console: https://console.cloud.google.com/
 * 2. בחר את הפרויקט שלך
 * 3. לך ל-APIs & Services > OAuth consent screen
 *    - הוסף את המייל שלך כ-Test user
 * 4. לך ל-APIs & Services > Library
 *    - חפש "Gmail API" והפעל אותו
 * 5. לך ל-APIs & Services > Credentials
 *    - לחץ על OAuth 2.0 Client שלך
 *    - וודא שיש Authorized redirect URI: http://localhost:5000/api/auth/gmail/callback
 *    (כנראה שכבר יש לך http://localhost:5000/api/auth/google/callback - פשוט הוסף עוד אחד)
 *
 * 6. הרץ את הסקריפט הזה: node scripts/getGmailToken.js
 * 7. עקוב אחרי הקישור שיופיע והתחבר עם חשבון Gmail
 * 8. העתק את ה-Refresh Token לקובץ .env
 */

import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:5000/api/auth/gmail/callback';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Gmail API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose'
];

// Generate auth URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // Force to get refresh token
});

console.log('\n📧 Gmail OAuth2 Token Generator\n');
console.log('='.repeat(60));
console.log('\n1. פתח את הקישור הבא בדפדפן:\n');
console.log('\x1b[36m%s\x1b[0m', authUrl);
console.log('\n2. התחבר עם חשבון Gmail שלך: torino900100@gmail.com');
console.log('3. אשר את ההרשאות הנדרשות');
console.log('4. תופנה חזרה לכאן עם ה-Token\n');
console.log('='.repeat(60));
console.log('\n⏳ ממתין לאישור...\n');

// Start local server to catch the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:5000`);

  if (url.pathname === '/api/auth/gmail/callback') {
    const code = url.searchParams.get('code');

    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html dir="rtl" lang="he">
          <head>
            <meta charset="UTF-8">
            <title>הצלחה! ✅</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 50px; background: #f0f9f0; text-align: center; }
              .box { background: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .token { background: #f5f5f5; padding: 15px; border-radius: 5px; word-break: break-all; font-family: monospace; font-size: 12px; text-align: left; direction: ltr; }
              h1 { color: #2e7d32; }
            </style>
          </head>
          <body>
            <div class="box">
              <h1>✅ הצלחה!</h1>
              <p>ה-Refresh Token נוצר בהצלחה.</p>
              <p>העתק אותו לקובץ <code>.env</code>:</p>
              <div class="token">GMAIL_REFRESH_TOKEN=${tokens.refresh_token}</div>
              <p style="margin-top: 20px;">אפשר לסגור את הדפדפן ואת הסקריפט.</p>
            </div>
          </body>
          </html>
        `);

        console.log('\n✅ הצלחה! הנה ה-Refresh Token:\n');
        console.log('='.repeat(60));
        console.log('\x1b[32m%s\x1b[0m', `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log('='.repeat(60));
        console.log('\n📝 העתק את השורה למעלה לקובץ .env שלך\n');

        // Close server after a short delay
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 2000);

      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>שגיאה</h1><p>${error.message}</p>`);
        console.error('❌ שגיאה:', error.message);
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>שגיאה</h1><p>לא התקבל קוד אימות</p>');
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(5000, () => {
  console.log('🖥️  שרת מקומי פועל על http://localhost:5000');
});
