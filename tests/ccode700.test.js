/**
 * ✅ Phase 6.5.4: CCode 700 Support Test
 *
 * בודק שהמערכת מזהה CCode=700 כהצלחה
 */

import { isSuccessCode } from '../src/utils/hypPayClient.js';

describe('Phase 6.5.4: CCode 700 Support', () => {
  test('should recognize CCode 700 as success for hold (soft)', () => {
    const result = isSuccessCode('700', 'soft');
    expect(result).toBe(true);
  });

  test('should recognize CCode 0 as success for hold', () => {
    const result = isSuccessCode('0', 'soft');
    expect(result).toBe(true);
  });

  test('should recognize CCode 800 as success for hold', () => {
    const result = isSuccessCode('800', 'soft');
    expect(result).toBe(true);
  });

  test('should reject invalid codes for hold', () => {
    const result = isSuccessCode('4', 'soft'); // סירוב
    expect(result).toBe(false);
  });
});
