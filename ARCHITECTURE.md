# 🏗️ ארכיטקטורת אבטחה - זרימת Request

## 📊 תרשים זרימה

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│                                                              │
│  User clicks "Create Product" button                        │
│  ↓                                                           │
│  POST /api/admin/products                                   │
│  Headers: { Authorization: "Bearer eyJhbGc..." }            │
│  Body: { name: "iPhone 15", price: 4000 }                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Express Server                           │
│                                                              │
│  🔒 שכבה 1: HELMET (Security Headers)                       │
│  ├─ X-Frame-Options: DENY                                   │
│  ├─ X-Content-Type-Options: nosniff                         │
│  └─ Content-Security-Policy                                 │
│                           ↓                                  │
│  🔒 שכבה 2: CORS (Cross-Origin)                            │
│  └─ Check origin: http://localhost:3000 ✅                  │
│                           ↓                                  │
│  🔒 שכבה 3: RATE LIMITING (General)                        │
│  └─ Check: < 100 requests/minute? ✅                        │
│                           ↓                                  │
│  📦 Body Parser (JSON)                                       │
│  └─ Parse request body                                      │
│                           ↓                                  │
│  🔒 שכבה 4: RATE LIMITING (Admin)                          │
│  └─ Check: < 200 requests/15min? ✅                         │
│                           ↓                                  │
│  🔒 שכבה 5: SANITIZATION                                   │
│  ├─ Remove: <script>, <iframe>, javascript:                │
│  └─ Clean HTML from all fields                              │
│                           ↓                                  │
│  🔒 שכבה 6: AUTHENTICATION                                 │
│  ├─ Extract token from header                               │
│  ├─ Check token in blacklist? ❌                            │
│  ├─ Verify JWT signature ✅                                 │
│  ├─ Find user in DB ✅                                      │
│  └─ Attach user to req.user                                 │
│                           ↓                                  │
│  🔒 שכבה 7: AUTHORIZATION (Admin)                          │
│  └─ Check: req.user.role === 'admin'? ✅                    │
│                           ↓                                  │
│  🔒 שכבה 8: INPUT VALIDATION                               │
│  ├─ name: "iPhone 15" (2-200 chars) ✅                      │
│  ├─ price: 4000 (positive number) ✅                        │
│  └─ All fields valid ✅                                     │
│                           ↓                                  │
│  📝 שכבה 9: AUDIT LOG (Pre-execution)                      │
│  └─ Prepare to log action                                   │
│                           ↓                                  │
│  💾 Controller: createProduct()                             │
│  ├─ Create product in MongoDB                               │
│  └─ Return success response                                 │
│                           ↓                                  │
│  📝 שכבה 10: AUDIT LOG (Post-execution)                    │
│  └─ Log: {                                                  │
│      userId: "507f1f77bcf86cd799439011",                    │
│      action: "CREATE_PRODUCT",                              │
│      resourceId: "507f1f77bcf86cd799439012",                │
│      status: "SUCCESS",                                     │
│      timestamp: "2025-10-23T10:30:00Z"                      │
│    }                                                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Response                                  │
│                                                              │
│  Status: 201 Created                                        │
│  Body: {                                                    │
│    success: true,                                           │
│    data: {                                                  │
│      _id: "507f1f77bcf86cd799439012",                       │
│      name: "iPhone 15",                                     │
│      price: 4000,                                           │
│      createdAt: "2025-10-23T10:30:00Z"                      │
│    }                                                         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 תרחישי שגיאה

### תרחיש 1: Rate Limit Exceeded
```
User → (11th login attempt)
       ↓
🔒 Rate Limiter (Auth)
   └─ Count: 11 > max: 10 ❌
       ↓
💔 Response: 429 Too Many Requests
   {
     "success": false,
     "message": "יותר מדי ניסיונות, נסה שוב בעוד 15 דקות"
   }

⏱️ User must wait 15 minutes
```

### תרחיש 2: Invalid Input
```
User → POST /api/admin/products
       Body: { name: "A", price: -100 }
       ↓
🔒 Passes all security layers
       ↓
🔒 Input Validation
   ├─ name: "A" (< 2 chars) ❌
   └─ price: -100 (< 0) ❌
       ↓
💔 Response: 400 Bad Request
   {
     "success": false,
     "errors": [
       { field: "name", message: "שם חייב להיות 2-200 תווים" },
       { field: "price", message: "מחיר חייב להיות חיובי" }
     ]
   }
```

### תרחיש 3: Token Blacklisted
```
User → (already logged out)
       ↓
🔒 Authentication
   └─ Check blacklist
      └─ Token found in blacklist ❌
       ↓
💔 Response: 401 Unauthorized
   {
     "success": false,
     "message": "הטוקן בוטל, נא להתחבר מחדש"
   }
```

### תרחיש 4: Not Admin
```
User (role: "user") → POST /api/admin/products
       ↓
🔒 Passes authentication ✅
       ↓
🔒 Authorization (Admin)
   └─ req.user.role = "user" ≠ "admin" ❌
       ↓
💔 Response: 403 Forbidden
   {
     "success": false,
     "message": "גישה למנהלים בלבד"
   }
```

---

## 📂 מבנה קבצים

```
backend/src/
├── app.js                          # Entry point + global middleware
│   ├── helmet()                    # Security headers
│   ├── cors()                      # CORS policy
│   ├── generalRateLimiter          # 100/min limit
│   └── Routes mounting
│
├── middleware/
│   ├── auth.js                     # Authentication + Authorization
│   │   ├── auth                    # Verify JWT + Check blacklist
│   │   └── adminAuth               # Check role === 'admin'
│   │
│   ├── rateLimiter.js              # Rate limiting strategies
│   │   ├── generalRateLimiter      # 100/min
│   │   ├── adminRateLimiter        # 200/15min
│   │   └── authRateLimiter         # 10/15min
│   │
│   ├── auditLogger.js              # Activity logging
│   │   └── logAdminAction()        # Logs before & after action
│   │
│   └── validators.js               # Input validation
│       ├── validateProduct         # Product creation rules
│       ├── validateProductUpdate   # Product update rules
│       ├── validateOrderStatus     # Order status rules
│       ├── validateMongoId         # MongoDB ID format
│       └── sanitizeInput           # Remove dangerous HTML
│
├── models/
│   ├── User.js                     # User schema (with role)
│   ├── Product.js                  # Product schema
│   ├── Order.js                    # Order schema
│   └── AdminLog.js                 # Audit log schema ⭐ NEW
│
├── utils/
│   └── tokenBlacklist.js           # Token revocation system
│       ├── add()                   # Add token to blacklist
│       ├── has()                   # Check if token is blacklisted
│       └── cleanup()               # Auto-remove expired tokens
│
└── routes/
    ├── adminRoutes.js              # Admin endpoints (fully secured)
    │   └── Uses: rateLimiter + sanitizer + auth +
    │             adminAuth + validators + auditLogger
    │
    └── authRoutes.js               # Auth endpoints
        └── Uses: authRateLimiter on login/register
```

---

## 🔐 אסטרטגיות הגנה לפי תרחיש

| תרחיש תקיפה | שכבת הגנה | איך זה עובד |
|-------------|----------|-------------|
| **Brute Force Login** | authRateLimiter | מקסימום 10 ניסיונות ל-15 דקות |
| **DDoS Attack** | generalRateLimiter | מקסימום 100 בקשות לדקה |
| **XSS Injection** | sanitizeInput + validators | מסיר `<script>`, `<iframe>`, `onclick=` |
| **SQL/NoSQL Injection** | validators | בדיקת פורמטים + express-validator |
| **Stolen Token** | Token Blacklist | אחרי logout ה-token מבוטל |
| **Unauthorized Access** | auth + adminAuth | בדיקת JWT + בדיקת role |
| **Data Manipulation** | validators | בדיקת כל שדה לפני שמירה |
| **Insider Threat** | Audit Logging | רישום כל פעולה עם מי, מה, מתי |
| **Invalid Data** | Input Validation | בדיקת טווחים, פורמטים, טיפוסים |

---

## 🧪 מטריקות ביצועים

| שכבה | זמן ממוצע | השפעה על UX |
|------|-----------|-------------|
| Helmet | ~0.1ms | אפס |
| CORS | ~0.2ms | אפס |
| Rate Limiter | ~0.5ms | אפס |
| Sanitization | ~1ms | אפס |
| Authentication | ~10ms | קלה (DB query) |
| Authorization | ~0.1ms | אפס |
| Validation | ~1ms | אפס |
| Audit Log | 0ms (async) | אפס |
| **סה"כ** | **~13ms** | **זניח** |

💡 **מסקנה:** שכבות האבטחה מוסיפות פחות מ-15ms לזמן תגובה, שזה זניח לחלוטין.

---

## 🔄 זרימת Logout

```
User clicks "Logout"
       ↓
POST /api/auth/logout
Headers: { Authorization: "Bearer TOKEN_ABC123" }
       ↓
🔒 Authentication middleware
   ├─ Extract token: "TOKEN_ABC123"
   ├─ Verify token ✅
   ├─ Find user ✅
   └─ Attach token to req.token
       ↓
💾 Logout controller
   ├─ Decode token → exp: 1730000000
   ├─ Add to blacklist: tokenBlacklist.add("TOKEN_ABC123", exp)
   └─ Return success
       ↓
✅ Response: { success: true, message: "התנתקת בהצלחה" }
       ↓
🔒 Next request with same token
   └─ Authentication middleware
      └─ Check blacklist: has("TOKEN_ABC123") = true ❌
         ↓
💔 Response: 401 "הטוקן בוטל, נא להתחבר מחדש"
```

---

## 📊 נתוני Audit Log

### מבנה Record:
```javascript
{
  _id: ObjectId("..."),
  userId: ObjectId("507f1f77bcf86cd799439011"),
  userEmail: "admin@example.com",
  action: "CREATE_PRODUCT",
  resourceType: "Product",
  resourceId: "507f1f77bcf86cd799439012",
  details: {
    method: "POST",
    path: "/api/admin/products",
    body: { name: "iPhone 15", price: 4000 },
    params: {},
    query: {}
  },
  ipAddress: "192.168.1.100",
  userAgent: "Mozilla/5.0 Chrome/120.0.0",
  status: "SUCCESS",
  createdAt: ISODate("2025-10-23T10:30:00.000Z")
}
```

### אינדקסים לביצועים:
```javascript
{ userId: 1, createdAt: -1 }      // Find by user
{ action: 1, createdAt: -1 }      // Find by action
{ resourceType: 1, resourceId: 1 } // Find by resource
{ createdAt: -1 }                  // Sort by date
```

---

## 🎯 נקודות חזקות

✅ **Defense in Depth:** שכבות הגנה מרובות
✅ **Zero Trust:** כל בקשה נבדקת מחדש
✅ **Logging:** שקיפות מלאה
✅ **Validation:** רק נתונים תקינים
✅ **Rate Limiting:** הגנה מפני abuse
✅ **Token Revocation:** logout אמיתי

---

## ⚠️ נקודות לשיפור (Production)

1. **Redis ל-Blacklist** - במקום זיכרון local
2. **CSRF Tokens** - הגנה נוספת
3. **2FA למנהלים** - שכבת אימות נוספת
4. **IP Whitelisting** - הגבל admin לIPים ספציפיים
5. **Monitoring & Alerts** - Sentry/LogRocket
6. **Backup Strategy** - גיבוי audit logs

---

**עודכן:** Week 5
**גרסה:** 1.0.0
