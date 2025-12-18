/**
 * בדיקת חיבור ל-Hyp Pay
 *
 * סקריפט פשוט שבודק את החיבור ל-Hyp Pay ומראה מה קורה
 */

import dotenv from 'dotenv';
import axios from 'axios';

// טען משתני סביבה
dotenv.config();

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║         🧪 בדיקת חיבור ל-Hyp Pay - Test Mode                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// בדוק משתני סביבה
console.log('📋 משתני סביבה:');
console.log('─'.repeat(70));
console.log(`HYP_MASOF: ${process.env.HYP_MASOF || 'חסר ❌'}`);
console.log(`HYP_PASSP: ${process.env.HYP_PASSP || 'חסר ❌'}`);
console.log(`HYP_API_KEY: ${process.env.HYP_API_KEY ? process.env.HYP_API_KEY.substring(0, 10) + '...' : 'חסר ❌'}`);
console.log(`HYP_TEST_MODE: ${process.env.HYP_TEST_MODE || 'false'}`);
console.log(`HYP_API_URL: ${process.env.HYP_API_URL || 'https://pay.hyp.co.il/p/'}`);
console.log('─'.repeat(70));

if (!process.env.HYP_MASOF || !process.env.HYP_PASSP) {
  console.error('\n❌ שגיאה: חסרים פרטי Hyp Pay!');
  console.log('\nצריך להגדיר ב-.env:');
  console.log('  HYP_MASOF=0010341822');
  console.log('  HYP_PASSP=hyp1234');
  console.log('  HYP_TEST_MODE=true');
  process.exit(1);
}

console.log('\n✅ כל משתני הסביבה קיימים!\n');

// בדיקה 1: Postpone Transaction (Hold)
console.log('═'.repeat(70));
console.log('🧪 בדיקה 1: Postpone Transaction (Hold)');
console.log('═'.repeat(70));

const testOrderNumber = 'TEST-' + Date.now();

const holdParams = {
  action: 'soft',
  Masof: process.env.HYP_MASOF,
  PassP: process.env.HYP_PASSP,
  Amount: 100,
  Postpone: 'True',
  Order: testOrderNumber,
  Info: 'בדיקת מערכת',
  UserId: '000000000',
  ClientName: 'בדיקה',
  ClientLName: 'טסט',
  CC: '5326105300985614',  // כרטיס בדיקה
  Tmonth: '12',
  Tyear: '25',
  cvv: '125',
  UTF8: 'True',
  UTF8out: 'True',
  Coin: '1'
};

console.log('\n📤 שולח בקשה:');
console.log(JSON.stringify({
  action: holdParams.action,
  Amount: holdParams.Amount,
  Postpone: holdParams.Postpone,
  Order: holdParams.Order,
  CC: '**** **** **** ' + holdParams.CC.slice(-4)
}, null, 2));

try {
  const formData = new URLSearchParams();
  Object.keys(holdParams).forEach(key => {
    formData.append(key, holdParams[key].toString());
  });

  const response = await axios.post(
    process.env.HYP_API_URL || 'https://pay.hyp.co.il/p/',
    formData.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 30000
    }
  );

  console.log('\n📥 תשובה מ-Hyp Pay:');
  console.log('─'.repeat(70));
  console.log('Raw Response:');
  console.log(response.data);
  console.log('─'.repeat(70));

  // פענח תשובה
  const result = {};
  const params = new URLSearchParams(response.data);
  for (const [key, value] of params) {
    result[key] = value;
  }

  console.log('\n📊 תשובה מפוענחת:');
  console.log(JSON.stringify(result, null, 2));

  if (result.CCode === '800') {
    console.log('\n✅ הצלחה! Hold בוצע בהצלחה');
    console.log(`   מזהה עסקה: ${result.Id}`);
    console.log(`   סכום: ${result.Amount}`);
    console.log(`   קוד: ${result.CCode} (עסקה מושהית)`);

    // בדיקה 2: Query Transaction
    console.log('\n═'.repeat(70));
    console.log('🧪 בדיקה 2: Query Transaction');
    console.log('═'.repeat(70));

    const queryParams = {
      action: 'QueryTrans',
      Masof: process.env.HYP_MASOF,
      PassP: process.env.HYP_PASSP,
      TransId: result.Id,
      UTF8: 'True',
      UTF8out: 'True'
    };

    console.log(`\n📤 שואל על עסקה: ${result.Id}`);

    const queryFormData = new URLSearchParams();
    Object.keys(queryParams).forEach(key => {
      queryFormData.append(key, queryParams[key].toString());
    });

    const queryResponse = await axios.post(
      process.env.HYP_API_URL || 'https://pay.hyp.co.il/p/',
      queryFormData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    console.log('\n📥 תשובת Query:');
    console.log('─'.repeat(70));
    console.log(queryResponse.data);
    console.log('─'.repeat(70));

    const queryResult = {};
    const queryParsed = new URLSearchParams(queryResponse.data);
    for (const [key, value] of queryParsed) {
      queryResult[key] = value;
    }

    console.log('\n📊 Query מפוענח:');
    console.log(JSON.stringify(queryResult, null, 2));

    // בדיקה 3: Cancel Transaction
    console.log('\n═'.repeat(70));
    console.log('🧪 בדיקה 3: Cancel Transaction');
    console.log('═'.repeat(70));

    const cancelParams = {
      action: 'CancelTrans',
      Masof: process.env.HYP_MASOF,
      PassP: process.env.HYP_PASSP,
      TransId: result.Id,
      UTF8: 'True',
      UTF8out: 'True'
    };

    console.log(`\n📤 מבטל עסקה: ${result.Id}`);

    const cancelFormData = new URLSearchParams();
    Object.keys(cancelParams).forEach(key => {
      cancelFormData.append(key, cancelParams[key].toString());
    });

    const cancelResponse = await axios.post(
      process.env.HYP_API_URL || 'https://pay.hyp.co.il/p/',
      cancelFormData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    console.log('\n📥 תשובת Cancel:');
    console.log('─'.repeat(70));
    console.log(cancelResponse.data);
    console.log('─'.repeat(70));

    const cancelResult = {};
    const cancelParsed = new URLSearchParams(cancelResponse.data);
    for (const [key, value] of cancelParsed) {
      cancelResult[key] = value;
    }

    console.log('\n📊 Cancel מפוענח:');
    console.log(JSON.stringify(cancelResult, null, 2));

    if (cancelResult.CCode === '0') {
      console.log('\n✅ ביטול הצליח!');
    }

  } else {
    console.log(`\n❌ Hold נכשל!`);
    console.log(`   קוד שגיאה: ${result.CCode}`);
    console.log(`   הודעה: ${result.errMsg || 'אין הודעה'}`);
  }

} catch (error) {
  console.error('\n❌ שגיאה בתקשורת:');
  console.error(error.message);

  if (error.response) {
    console.error('\nResponse Status:', error.response.status);
    console.error('Response Data:', error.response.data);
  }
}

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║                    🎉 בדיקה הסתיימה                            ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
