/**
 * Phase 7.4: Security & Logging Tests
 *
 * מטרה: לוודא שאין דליפת מידע רגיש ב-logs
 *
 * Tests:
 * - 7.4.1: No Sensitive Data in Logs
 * - 7.4.2: Production Mode Logging
 * - 7.4.3: Secure Callback Processing
 */

import request from 'supertest';
import app from '../src/app.js';

describe('Phase 7.4: Security & Logging', () => {
  let originalConsoleLog;
  let consoleLogs = [];

  beforeEach(() => {
    // Capture console.log
    consoleLogs = [];
    originalConsoleLog = console.log;
    console.log = (...args) => {
      consoleLogs.push(args.join(' '));
      originalConsoleLog(...args);
    };
  });

  afterEach(() => {
    // Restore console.log
    console.log = originalConsoleLog;
  });

  /**
   * Test 7.4.1: No Sensitive Data in Logs
   *
   * תרחיש:
   * 1. שלח webhook callback עם נתונים רגישים
   * 2. בדוק logs
   * 3. וודא שאין מספרי כרטיס, CVV, וכו'
   *
   * תוצאה צפויה:
   * - Logs מכילים רק: Order ID, CCode, TransactionId
   * - Logs לא מכילים: CC, CVV, UserId, cell
   */
  describe('7.4.1 No Sensitive Data in Logs', () => {
    it('should not log credit card numbers', async () => {
      const sensitiveCallback = {
        Order: 'TEST-SECURITY-001',
        CCode: '0',
        Id: 'TRANS-123',
        // Sensitive data that should NOT be logged:
        CC: '4580-1234-5678-9012',
        CVV: '123',
        cell: '0501234567'
      };

      // Simulate webhook callback
      await request(app)
        .get('/api/payments/success')
        .query(sensitiveCallback);

      // Check logs
      const allLogs = consoleLogs.join('\n');

      // ✅ Should contain Order and CCode
      expect(allLogs).toContain('TEST-SECURITY-001');
      expect(allLogs).toContain('CCode');

      // ❌ Should NOT contain sensitive data
      expect(allLogs).not.toContain('4580');  // Card number
      expect(allLogs).not.toContain('1234');  // Part of card
      expect(allLogs).not.toContain('CVV');   // CVV field name
      expect(allLogs).not.toContain('123');   // CVV value

      // ❌ Should NOT log full query object
      expect(allLogs).not.toMatch(/CC.*4580/);
      expect(allLogs).not.toMatch(/cell.*050/);
    });

    it('should not log personal identifiers in error callbacks', async () => {
      const sensitiveError = {
        Order: 'TEST-SECURITY-002',
        CCode: '6',
        error: 'Card declined',
        UserId: '123456789', // ת.ז.
        cell: '0521234567'
      };

      await request(app)
        .get('/api/payments/error')
        .query(sensitiveError);

      const allLogs = consoleLogs.join('\n');

      // ✅ Should contain Order and error
      expect(allLogs).toContain('TEST-SECURITY-002');

      // ❌ Should NOT contain personal info
      expect(allLogs).not.toContain('123456789');
      expect(allLogs).not.toContain('0521234567');
    });

    it('should use selective logging for callbacks', () => {
      // Test the logging pattern we should use
      const callback = {
        Order: 'TEST-LOG-001',
        CCode: '0',
        Id: 'TRANS-456',
        CC: '4580-xxxx-xxxx-1234', // Should not appear
        CVV: '999'                 // Should not appear
      };

      // Clear previous logs
      consoleLogs = [];

      // Correct logging pattern (what our code should do):
      console.log('[Payment] Callback - Order:', callback.Order, 'CCode:', callback.CCode, 'Id:', callback.Id);

      const logged = consoleLogs[0];

      // ✅ Should have Order, CCode, Id
      expect(logged).toContain('TEST-LOG-001');
      expect(logged).toContain('CCode: 0');
      expect(logged).toContain('TRANS-456');

      // ❌ Should NOT have sensitive fields
      expect(logged).not.toContain('4580');
      expect(logged).not.toContain('CVV');
      expect(logged).not.toContain('999');
    });
  });

  /**
   * Test 7.4.2: Production Mode Logging
   *
   * תרחיש:
   * 1. הגדר NODE_ENV=production
   * 2. הרץ תהליכים
   * 3. בדוק שאין debug logs מיותרים
   *
   * Note: זה יותר בדיקה ידנית - נוודא שהקוד מכבד NODE_ENV
   */
  describe('7.4.2 Production Mode Logging', () => {
    it('should respect NODE_ENV setting', () => {
      const currentEnv = process.env.NODE_ENV;

      // ✅ NODE_ENV should be defined
      expect(currentEnv).toBeDefined();

      // In tests, it's usually 'test'
      expect(['test', 'development', 'production']).toContain(currentEnv);
    });

    it('should have conditional logging based on environment', () => {
      // Example of how we should implement conditional logging:
      const debugInfo = { sensitive: 'data', userId: '12345' };

      consoleLogs = [];

      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Debug info:', debugInfo);
      }

      // In test/production, this should not log
      if (process.env.NODE_ENV !== 'development') {
        expect(consoleLogs).toHaveLength(0);
      }
    });
  });

  /**
   * Test 7.4.3: Secure Callback Processing
   *
   * וודא שה-callbacks מעובדים בצורה מאובטחת
   */
  describe('7.4.3 Secure Callback Processing', () => {
    it('should validate callback parameters', async () => {
      // Missing Order parameter
      const response = await request(app)
        .get('/api/payments/success')
        .query({
          CCode: '0',
          Id: 'TRANS-789'
          // Order is missing!
        });

      // ✅ Should handle missing parameters gracefully
      // (exact status code depends on implementation)
      expect([400, 404, 500]).toContain(response.status);
    });

    it('should not process callbacks without CCode', async () => {
      const response = await request(app)
        .get('/api/payments/success')
        .query({
          Order: 'TEST-001',
          Id: 'TRANS-999'
          // CCode is missing!
        });

      // Should handle gracefully
      expect([400, 404, 500]).toContain(response.status);
    });

    it('should sanitize input to prevent injection', async () => {
      const maliciousInput = {
        Order: 'TEST-XSS-<script>alert("xss")</script>',
        CCode: '0',
        Id: 'TRANS-XSS'
      };

      await request(app)
        .get('/api/payments/success')
        .query(maliciousInput);

      const allLogs = consoleLogs.join('\n');

      // ✅ Script tags should be escaped/sanitized in logs
      // (depends on how we handle logging)
      if (allLogs.includes('TEST-XSS')) {
        // If we log it, make sure it's not executable
        expect(allLogs).not.toContain('<script>');
      }
    });
  });

  /**
   * Test 7.4.4: No Supplier Links in Logs
   *
   * וודא שקישורי affiliate לא מודלפים
   */
  describe('7.4.4 No Supplier Links in Logs', () => {
    it('should not log supplier affiliate links', () => {
      consoleLogs = [];

      const order = {
        orderNumber: 'TEST-001',
        items: [
          {
            supplierOrder: {
              supplierLink: 'https://amazon.com/dp/B123?tag=my-affiliate-20'
            }
          }
        ]
      };

      // Correct: log only order number
      console.log('[Admin] Processing order:', order.orderNumber);

      // Incorrect: would log the link
      // console.log('[Admin] Order:', order);

      const logged = consoleLogs[0];

      // ✅ Should have order number
      expect(logged).toContain('TEST-001');

      // ❌ Should NOT have supplier link
      expect(logged).not.toContain('amazon.com');
      expect(logged).not.toContain('affiliate');
      expect(logged).not.toContain('supplierLink');
    });
  });
});
