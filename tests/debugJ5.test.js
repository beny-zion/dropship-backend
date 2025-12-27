/**
 * Debug J5 Partial Capture Parameters
 */

import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
process.env.HYP_MOCK_MODE = 'true';
process.env.HYP_TEST_MODE = 'true';

import { sendRequest } from '../src/utils/hypPayClient.js';

describe('Debug J5 Parameters', () => {
  test('should send all J5 parameters correctly', async () => {
    const params = {
      action: 'soft',
      Amount: 1229,
      Order: 'TEST-ORDER',
      'inputObj.originalUid': 'L4258784304',
      'inputObj.originalAmount': 1229,
      'AuthNum': '0033796',
      'inputObj.authorizationCodeManpik': '7'
    };

    console.log('\n📤 Sending J5 Partial Capture request with params:', params);

    const result = await sendRequest(params);

    console.log('\n📥 Received response:', result);

    expect(result.CCode).toBe('0'); // Partial capture should return 0
  });
});
