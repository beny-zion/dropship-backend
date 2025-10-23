// utils/tokenBlacklist.js - מערכת פשוטה לביטול tokens

// במימוש פשוט נשתמש ב-Set בזיכרון
// בפרודקשן אמיתי כדאי להשתמש ב-Redis
class TokenBlacklist {
  constructor() {
    this.blacklist = new Set();
    this.cleanup();
  }

  // הוספת token לרשימה השחורה
  add(token, expiryTime = Date.now() + 24 * 60 * 60 * 1000) {
    this.blacklist.add(JSON.stringify({
      token,
      expiryTime
    }));
  }

  // בדיקה אם token ברשימה השחורה
  has(token) {
    for (let item of this.blacklist) {
      const parsed = JSON.parse(item);
      if (parsed.token === token) {
        // אם פג תוקף - מסיר אותו
        if (parsed.expiryTime < Date.now()) {
          this.blacklist.delete(item);
          return false;
        }
        return true;
      }
    }
    return false;
  }

  // ניקוי אוטומטי של tokens שפג תוקפם (כל שעה)
  cleanup() {
    setInterval(() => {
      const now = Date.now();
      for (let item of this.blacklist) {
        const parsed = JSON.parse(item);
        if (parsed.expiryTime < now) {
          this.blacklist.delete(item);
        }
      }
      console.log(`🧹 Token blacklist cleanup: ${this.blacklist.size} tokens remaining`);
    }, 60 * 60 * 1000); // כל שעה
  }

  // מחיקה ידנית של token
  remove(token) {
    for (let item of this.blacklist) {
      const parsed = JSON.parse(item);
      if (parsed.token === token) {
        this.blacklist.delete(item);
        return true;
      }
    }
    return false;
  }

  // ספירת tokens ברשימה
  size() {
    return this.blacklist.size;
  }

  // ניקוי מלא (למקרי חירום)
  clear() {
    this.blacklist.clear();
  }
}

// Singleton instance
const tokenBlacklist = new TokenBlacklist();

export default tokenBlacklist;
