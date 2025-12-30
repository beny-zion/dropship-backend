import axios from 'axios';
import qs from 'querystring';

// הגדרות המסוף שלך [cite: 28-30]
const CONFIG = {
    MASOF: '0010341822',
    PASS_P: 'hyp1234',
    KEY: 'fb633dd4fb7c18c39806acf7d6487775553e463a',
    URL: 'https://pay.hyp.co.il/p/'
};

// פרטי ההזמנה העסקית (דוגמה)
const ORDER_INFO = {
    orderId: 'ORDER-123456',
    customerName: 'Beni Test',
    totalAmount: 100,  // סכום כולל של ההזמנה
    shipments: [
        { shipmentId: 1, amount: 50, description: 'משלוח ראשון' },
        { shipmentId: 2, amount: 30, description: 'משלוח שני' },
        { shipmentId: 3, amount: 20, description: 'משלוח שלישי' }
    ]
};

/**
 * שלב 1: ביצוע עסקת J5 (שיריון מסגרת)
 */
async function createJ5(orderInfo) {
    console.log(`--- שלב 1: יצירת עסקת J5 להזמנה ${orderInfo.orderId} ---`);
    const payload = {
        action: 'soft',
        Masof: CONFIG.MASOF,
        PassP: CONFIG.PASS_P,
        KEY: CONFIG.KEY,
        Amount: orderInfo.totalAmount.toString(), // סכום כולל של ההזמנה
        Coin: '1',             // מטבע: 1 לשקל (מונע שגיאה 16) [cite: 71]
        J5: 'True',            // שיריון מסגרת [cite: 74-75]
        MoreData: 'True',      // לקבלת UID ופרטים מורחבים [cite: 66, 174]
        CC: '5326105300985614',
        Tmonth: '12',
        Tyear: '2025',
        cvv: '125',
        UserId: '000000000', // מספר ת"ז (חובה)
        ClientName: orderInfo.customerName.split(' ')[0], // שם פרטי
        ClientLName: orderInfo.customerName.split(' ')[1] || 'Customer', // שם משפחה
        Info: `הזמנה ${orderInfo.orderId} - שיריון מסגרת ${orderInfo.totalAmount} ש"ח`, // תיאור ברור
        Fild1: orderInfo.orderId, // שדה מותאם אישית למזהה הזמנה
        UTF8: 'True',
        UTF8out: 'True'
    };

    try {
        const response = await axios.post(CONFIG.URL, qs.stringify(payload));
        const resData = qs.parse(response.data);

        if (resData.CCode === '700') { // סטטוס אישור ללא חיוב [cite: 19, 487]
            console.log(`✅ שלב 1 הצליח! J5 אושר להזמנה ${orderInfo.orderId}`);
            console.log(`   - סכום ששוריין: ${orderInfo.totalAmount} ש"ח`);
            console.log(`   - Id (לשימוש בטוקן): ${resData.Id}`);
            console.log(`   - UID: ${resData.UID}`);
            console.log(`   - ACode: ${resData.ACode}`);
            return resData;
        } else {
            console.error('❌ שגיאה בשלב 1:', resData.CCode, resData.errMsg || '');
            return null;
        }
    } catch (error) {
        console.error('תקלה בתקשורת בשלב 1:', error.message);
    }
}

/**
 * שלב 2: יצירת טוקן (getToken) מהעסקה הקיימת [cite: 200-201]
 */
async function createToken(transId, orderInfo) {
    console.log(`\n--- שלב 2: יצירת טוקן להזמנה ${orderInfo.orderId} ---`);
    const payload = {
        action: 'getToken',    // פקודה ליצירת טוקן [cite: 201]
        Masof: CONFIG.MASOF,
        PassP: CONFIG.PASS_P,
        TransId: transId,      // ה-Id שחזר משלב ה-J5 [cite: 202]
        UTF8: 'True',
        UTF8out: 'True'
    };

    try {
        const response = await axios.post(CONFIG.URL, qs.stringify(payload));
        const resData = qs.parse(response.data);

        if (resData.CCode === '0') { // הצלחה ביצירת טוקן [cite: 210]
            console.log('✅ שלב 2 הצליח! הופק טוקן.');
            console.log(`   - Token: ${resData.Token}`);
            return resData;
        } else {
            console.error('❌ שגיאה בשלב 2:', resData.CCode);
            return null;
        }
    } catch (error) {
        console.error('תקלה בתקשורת בשלב 2:', error.message);
    }
}

/**
 * שלב 3: מימוש העסקה (SOFT) בעזרת הטוקן והפרמטרים המקוריים
 */
async function captureSOFT(j5Response, tokenResponse, shipment, orderInfo) {
    console.log(`\n--- שלב 3: חיוב ${shipment.description} (${shipment.amount} ש"ח) להזמנה ${orderInfo.orderId} ---`);

    // פורמט סכום לאגורות: 10 ש"ח = 1000
    const formattedAmount = (parseFloat(shipment.amount) * 100).toString();

    // פירוק התוקף (Tokef) שמגיע בפורמט YYMM לפורמט הנדרש [cite: 212-213]
    const tYear = '20' + tokenResponse.Tokef.substring(0, 2);
    const tMonth = tokenResponse.Tokef.substring(2, 4);

    const payload = {
        action: 'soft',
        Masof: CONFIG.MASOF,
        PassP: CONFIG.PASS_P,
        KEY: CONFIG.KEY,
        
        // נתוני הטוקן [cite: 227-228]
        CC: tokenResponse.Token,     // מספר הטוקן
        Tmonth: tMonth,
        Tyear: tYear,
        Token: 'True',               // מציין שימוש בטוקן [cite: 255-256]
        
        // פרמטרי קישור לעסקת ה-J5 המקורית [cite: 178-182]
        'inputObj.originalUid': j5Response.UID,
        'inputObj.originalAmount': formattedAmount, 
        'AuthNum': j5Response.ACode,
        'inputObj.authorizationCodeManpik': '7',

        // נתונים הכרחיים למניעת שגיאות אימות
        Amount: shipment.amount.toString(), // הסכום בשקלים לחיוב
        Coin: '1',                   // חובה למניעת שגיאה 16
        Info: `הזמנה ${orderInfo.orderId} - ${shipment.description} (${shipment.amount} ש"ח)`,
        ClientName: orderInfo.customerName.split(' ')[0],
        ClientLName: orderInfo.customerName.split(' ')[1] || 'Customer',
        UserId: '000000000',
        Fild1: orderInfo.orderId, // מזהה הזמנה
        Fild2: `Shipment-${shipment.shipmentId}`, // מזהה משלוח
        
        UTF8: 'True',
        UTF8out: 'True'
    };

    try {
        const response = await axios.post(CONFIG.URL, qs.stringify(payload));
        const resData = qs.parse(response.data);

        if (resData.CCode === '0') { // עסקה תקינה [cite: 121, 399]
            console.log(`✅ ${shipment.description} חויב בהצלחה!`);
            console.log(`   - סכום שחויב: ${shipment.amount} ש"ח`);
            console.log(`   - Id עסקה: ${resData.Id}`);
        } else {
            console.error('❌ שגיאה בשלב 3:', resData.CCode);
            console.log('פירוט מהשרת:', resData);
        }
    } catch (error) {
        console.error('תקלה בתקשורת בשלב 3:', error.message);
    }
}

// הרצת הרצף המלא - סימולציה של הזמנה עם 3 משלוחים
(async () => {
    console.log(`========================================`);
    console.log(`טסט J5: הזמנה ${ORDER_INFO.orderId}`);
    console.log(`לקוח: ${ORDER_INFO.customerName}`);
    console.log(`סכום כולל: ${ORDER_INFO.totalAmount} ש"ח`);
    console.log(`========================================\n`);

    // 1. מבצעים J5 - שיריון מסגרת לכל ההזמנה
    const j5Data = await createJ5(ORDER_INFO);

    if (j5Data) {
        // 2. מפיקים טוקן מה-Id של ה-J5 (נשמור אותו לשימוש חוזר)
        const tokenData = await createToken(j5Data.Id, ORDER_INFO);

        if (tokenData) {
            // 3. מממשים את המשלוח הראשון בלבד (50 ש"ח)
            console.log(`\n📦 מבצעים חיוב למשלוח ראשון בלבד...`);
            await captureSOFT(j5Data, tokenData, ORDER_INFO.shipments[0], ORDER_INFO);

            console.log(`\n💡 הערה: ניתן יהיה לחייב את המשלוחים הנוספים מאותו טוקן בעתיד:`);
            console.log(`   - ${ORDER_INFO.shipments[1].description}: ${ORDER_INFO.shipments[1].amount} ש"ח`);
            console.log(`   - ${ORDER_INFO.shipments[2].description}: ${ORDER_INFO.shipments[2].amount} ש"ח`);
        }
    }
})();