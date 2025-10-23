# 🔒 מערכות אבטחה - Amazon Dropship Backend

## סקירה כללית

הוספנו 4 שכבות אבטחה מרכזיות לפרויקט, כדי להגן על נתיבי ה-Admin Panel והמערכת בכלל.

---

## 🛡️ שכבות האבטחה

### 1️⃣ Rate Limiting - הגבלת בקשות

**מיקום:** `src/middleware/rateLimiter.js`

#### מה זה עושה?
מגביל את מספר הבקשות שניתן לשלוח מכתובת IP אחת בפרק זמן מסוים.

#### איפה זה משפיע?
```javascript
// Rate Limiter כללי - כל ה-API
100 בקשות לדקה

// Rate Limiter ל-Admin routes
200 בקשות ל-15 דקות

// Rate Limiter ל-Auth routes (login/register)
10 בקשות ל-15 דקות
```

#### למה זה חשוב?
- **מגן מפני Brute Force:** תוקף לא יכול לנסות אלפי סיסמאות בשנייה
- **מגן מפני DDoS:** לא ניתן להציף את השרת בבקשות
- **חוסך משאבים:** משתמשים לא יכולים להעמיס על השרת

#### דוגמה למה קורה כשמגיעים למגבלה:
```json
{
  "success": false,
  "message": "יותר מדי בקשות, נסה שוב בעוד 15 דקות"
}
```

#### תכונות מיוחדות:
- **Whitelist IP:** אפשר להוסיף IPs שלא יוגבלו (למשל staging server)
- **Skip Successful Requests:** התחברות מצליחה לא נספרת בניסיונות

---

### 2️⃣ Audit Logging - תיעוד פעולות

**מיקום:**
- Model: `src/models/AdminLog.js`
- Middleware: `src/middleware/auditLogger.js`

#### מה זה עושה?
רושם כל פעולה שמשתמש Admin מבצע במערכת.

#### מה נרשם?
```javascript
{
  userId: "מזהה המשתמש",
  userEmail: "admin@example.com",
  action: "CREATE_PRODUCT", // או UPDATE_PRODUCT, DELETE_PRODUCT וכו'
  resourceType: "Product",
  resourceId: "מזהה המוצר",
  ipAddress: "192.168.1.1",
  userAgent: "Chrome/120.0.0",
  status: "SUCCESS", // או FAILED
  timestamp: "2025-10-23T10:30:00Z"
}
```

#### איפה זה משפיע?
כל הפעולות הבאות נרשמות:
- ✅ יצירת מוצר
- ✅ עדכון מוצר
- ✅ מחיקת מוצר
- ✅ צפייה במוצרים
- ✅ עדכון סטטוס הזמנה (בעתיד)
- ✅ צפייה בדשבורד (בעתיד)

#### למה זה חשוב?
- **שקיפות:** יודעים מי עשה מה ומתי
- **Compliance:** נדרש לתקנות רבות (GDPR וכו')
- **חקירה:** אם משהו השתבש - אפשר לעקוב אחרי מה קרה
- **אבטחה:** אם admin נפרץ - נראה את הפעילות החריגה

#### איך לצפות בלוגים? (בעתיד)
תוכל להוסיף endpoint:
```javascript
GET /api/admin/logs
GET /api/admin/logs?userId=123
GET /api/admin/logs?action=DELETE_PRODUCT
```

---

### 3️⃣ Input Validation - אימות קלט

**מיקום:** `src/middleware/validators.js`

#### מה זה עושה?
בודק שכל המידע שנשלח לשרת תקין ובטוח לפני שמעבדים אותו.

#### איפה זה משפיע?
```javascript
// בדיקות למוצר:
✅ שם: 2-200 תווים
✅ מחיר: מספר חיובי עד 1,000,000
✅ תיאור: עד 5,000 תווים
✅ תמונות: עד 10 תמונות, URLs תקינים
✅ מלאי: מספר שלם חיובי

// בדיקות לסטטוס הזמנה:
✅ סטטוס: רק ערכים מותרים (pending, processing, shipped...)
✅ מספר מעקב: 5-50 תווים, רק אותיות ומספרים
✅ הערות: עד 1,000 תווים

// בדיקות MongoDB ID:
✅ ID תקין בפורמט MongoDB
```

#### דוגמה לשגיאת validation:
```json
{
  "success": false,
  "message": "שגיאות בנתונים שהוזנו",
  "errors": [
    {
      "field": "price",
      "message": "מחיר חייב להיות מספר חיובי",
      "value": -50
    }
  ]
}
```

#### למה זה חשוב?
- **מגן מפני XSS:** ניקוי תגי HTML מסוכנים
- **מגן מפני SQL/NoSQL Injection:** בדיקת פורמטים
- **איכות נתונים:** רק מידע תקין נכנס לDB
- **חוויית משתמש טובה:** הודעות שגיאה ברורות

#### תכונות Sanitization:
```javascript
// מסיר אוטומטית:
<script>alert('xss')</script>     // → הוסר
<iframe src="evil.com">           // → הוסר
onclick="malicious()"             // → הוסר
javascript:void(0)                // → הוסר
```

---

### 4️⃣ Token Blacklist - ביטול הרשאות

**מיקום:**
- Utility: `src/utils/tokenBlacklist.js`
- Integration: `src/middleware/auth.js`
- Logout: `src/controllers/authController.js`

#### מה זה עושה?
מאפשר לבטל JWT tokens כשמשתמש מתנתק, כך שהם לא יעבדו יותר.

#### איך זה עובד?

**לפני (בעיה):**
```
1. משתמש מתחבר → מקבל token
2. משתמש מתנתק → token עדיין תקף!
3. אם מישהו גנב את ה-token → יכול להשתמש בו
```

**עכשיו (פתרון):**
```
1. משתמש מתחבר → מקבל token
2. משתמש מתנתק → token מתוסף לרשימה שחורה
3. כל בקשה עם token זה → נדחית!
```

#### איפה זה משפיע?
```javascript
// בכל בקשה מאומתת:
1. בודק אם יש token
2. בודק אם token ברשימה שחורה ← חדש!
3. בודק אם token תקף
4. בודק אם משתמש קיים
5. מאשר בקשה
```

#### למה זה חשוב?
- **Logout אמיתי:** אחרי logout ה-token לא עובד
- **אבטחה:** אפשר לבטל הרשאה של admin חשוד
- **Session Management:** שליטה מלאה במי מחובר

#### ניקוי אוטומטי:
- כל שעה - מנקה tokens שפג תוקפם
- חוסך זיכרון
- לא צריך לעשות כלום

#### שדרוג לעתיד (Production):
במקום `Set` בזיכרון, כדאי להשתמש ב-**Redis**:
```javascript
// יתרונות Redis:
✅ שיתוף בין מספר שרתים
✅ Persistence - לא נאבד בעת restart
✅ TTL אוטומטי
✅ ביצועים מעולים
```

---

## 🎯 איך השכבות עובדות ביחד?

### דוגמה: Admin מוסיף מוצר חדש

```
📥 Request: POST /api/admin/products
Body: { name: "iPhone 15", price: 4000 }
Authorization: Bearer eyJhbGc...

⬇️ שכבה 1: Rate Limiting
✅ בדיקה: האם IP שלח פחות מ-200 בקשות ב-15 דקות?
   → כן → ממשיך
   → לא → 429 Too Many Requests

⬇️ שכבה 2: Sanitization
✅ ניקוי HTML/Scripts מסוכנים מכל השדות
   → Body נקי

⬇️ שכבה 3: Authentication
✅ בדיקת token
✅ בדיקה אם token ברשימה שחורה
✅ בדיקה אם משתמש קיים
✅ בדיקה אם role = admin
   → כן → ממשיך
   → לא → 401/403

⬇️ שכבה 4: Validation
✅ שם: "iPhone 15" ← תקין (2-200 תווים)
✅ מחיר: 4000 ← תקין (מספר חיובי)
   → תקין → ממשיך
   → לא תקין → 400 Bad Request

⬇️ שכבה 5: Audit Log (לפני ביצוע)
📝 רישום: "Admin user@example.com מנסה ליצור מוצר"

⬇️ ביצוע הפעולה
💾 יצירת המוצר ב-DB

⬇️ שכבה 6: Audit Log (אחרי ביצוע)
📝 רישום: "מוצר נוצר בהצלחה, ID: 12345"

📤 Response: 201 Created
{
  "success": true,
  "data": { "id": "12345", "name": "iPhone 15", ... }
}
```

---

## ⚙️ הגדרות סביבה (.env)

```bash
# Token Blacklist Whitelist (אופציונלי)
RATE_LIMIT_WHITELIST=127.0.0.1,::1

# JWT Settings (קיים)
JWT_SECRET=your-secret-key
JWT_EXPIRE=7d
```

---

## 📊 מגבלות נוכחיות

### Rate Limits:
| Route | חלון זמן | מקסימום בקשות |
|-------|---------|--------------|
| כללי (כל `/api/*`) | 1 דקה | 100 |
| Admin (`/api/admin/*`) | 15 דקות | 200 |
| Auth (`/api/auth/login`) | 15 דקות | 10 |

### Validation Limits:
| שדה | מינימום | מקסימום |
|-----|---------|---------|
| שם מוצר | 2 | 200 |
| תיאור | - | 5,000 |
| מחיר | 0 | 1,000,000 |
| תמונות | - | 10 |
| מספר מעקב | 5 | 50 |
| הערות | - | 1,000 |

---

## 🚀 איך להשתמש

### 1. התקנה
כבר הותקן אוטומטית:
```bash
npm install express-rate-limit express-validator
```

### 2. הרצה
```bash
npm start
```

תראה בקונסול:
```
🔒 Security Features:
   ✅ Rate Limiting (100/min general, 200/15min admin, 10/15min auth)
   ✅ Audit Logging (all admin actions tracked)
   ✅ Input Validation & Sanitization
   ✅ Token Blacklist (secure logout)
```

### 3. בדיקה

**בדיקת Rate Limiting:**
```bash
# נסה לשלוח 11 בקשות login בזה אחר זה
# ה-11 תיכשל עם 429
```

**בדיקת Validation:**
```bash
curl -X POST http://localhost:5000/api/admin/products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "A", "price": -100}'

# תקבל שגיאת validation
```

**בדיקת Token Blacklist:**
```bash
# 1. התחבר
POST /api/auth/login

# 2. התנתק
POST /api/auth/logout

# 3. נסה להשתמש באותו token
GET /api/auth/me
# תקבל: "הטוקן בוטל, נא להתחבר מחדש"
```

**בדיקת Audit Log:**
```bash
# כנס ל-MongoDB Compass
# חפש collection בשם "adminlogs"
# תראה את כל הפעולות
```

---

## 🔐 המלצות נוספות ל-Production

1. **Redis ל-Token Blacklist**
   ```bash
   npm install redis
   # שנה את tokenBlacklist.js להשתמש ב-Redis
   ```

2. **CSRF Protection**
   ```bash
   npm install csurf
   ```

3. **Helmet מתקדם**
   ```javascript
   app.use(helmet({
     contentSecurityPolicy: {
       directives: {
         defaultSrc: ["'self'"],
         styleSrc: ["'self'", "'unsafe-inline'"]
       }
     }
   }));
   ```

4. **Monitoring**
   - שלב עם Sentry / LogRocket
   - התראות על פעילות חריגה

5. **IP Whitelist לAdmin**
   - הגבל גישת admin לIPים ספציפיים

---

## ✅ סיכום

### מה שיפרנו:
| לפני | אחרי |
|------|------|
| ❌ אין הגבלת בקשות | ✅ Rate limiting על כל ה-API |
| ❌ אין תיעוד פעולות | ✅ Audit log מלא |
| ❌ validation חלקי | ✅ Validation מקיף + Sanitization |
| ❌ logout לא עובד | ✅ Token blacklist |
| ❌ אין הגנה מ-XSS | ✅ Sanitization אוטומטי |
| ❌ אין הגנה מ-Brute Force | ✅ Rate limiting על login |

### האם זה בטוח עכשיו?
- **לפיתוח/Staging:** ✅✅✅ מצוין!
- **ל-Production קטן:** ✅✅ טוב מאוד
- **ל-Production גדול:** ✅ טוב, אבל הוסף Redis + CSRF

---

**עודכן לאחרונה:** שבוע 5 - Admin Panel Security
**מחבר:** Claude
**גרסה:** 1.0.0
