// controllers/aiProductController.js
// AI-powered product processing using Google Gemini

import { GoogleGenerativeAI } from "@google/generative-ai";

// ========================================
// 🎨 לוגים צבעוניים ומפורטים
// ========================================
const logColors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

const logSection = (title, color = 'cyan') => {
  const line = '═'.repeat(60);
  console.log(`\n${logColors[color]}${logColors.bright}╔${line}╗${logColors.reset}`);
  console.log(`${logColors[color]}${logColors.bright}║ ${title.padEnd(58)} ║${logColors.reset}`);
  console.log(`${logColors[color]}${logColors.bright}╚${line}╝${logColors.reset}\n`);
};

const logKeyValue = (key, value, color = 'yellow') => {
  console.log(`${logColors[color]}▸ ${key}:${logColors.reset} ${value}`);
};

const logBox = (title, content, color = 'green') => {
  console.log(`\n${logColors[color]}┌─── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}┐${logColors.reset}`);
  const lines = content.split('\n').slice(0, 30); // מקסימום 30 שורות
  lines.forEach(line => {
    const truncated = line.length > 80 ? line.substring(0, 77) + '...' : line;
    console.log(`${logColors[color]}│${logColors.reset} ${truncated}`);
  });
  if (content.split('\n').length > 30) {
    console.log(`${logColors[color]}│${logColors.reset} ... (${content.split('\n').length - 30} more lines)`);
  }
  console.log(`${logColors[color]}└${'─'.repeat(55)}┘${logColors.reset}\n`);
};

// ========================================
// 🧹 ניקוי HTML - מפחית 80-90% מהתווים
// ========================================

/**
 * פונקציה לניקוי HTML - משאירה רק את הטקסט הרלוונטי
 * מפחיתה את כמות התווים ב-80-90%
 * @param {string} html - הטקסט הגולמי (HTML או טקסט רגיל)
 * @returns {string} - טקסט נקי
 */
const cleanHtmlData = (html) => {
  if (!html) return "";

  const originalLength = html.length;

  // שלב 1: חילוץ כל כתובות התמונות לפני הניקוי
  const imageUrls = [];
  const imgRegexes = [
    /src=["'](https?:\/\/[^"']+\.(jpg|jpeg|png|gif|webp)[^"']*?)["']/gi,
    /data-src=["'](https?:\/\/[^"']+\.(jpg|jpeg|png|gif|webp)[^"']*?)["']/gi,
    /srcset=["']([^"']+)["']/gi,
    /(https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp)(\?[^\s"'<>]*)?)/gi
  ];

  imgRegexes.forEach(regex => {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const url = match[1];
      if (url && url.length > 20 && url.length < 500) {
        // נקה את ה-URL מפרמטרים מיותרים
        const cleanUrl = url.split(',')[0].trim(); // עבור srcset
        if (!imageUrls.includes(cleanUrl)) {
          imageUrls.push(cleanUrl);
        }
      }
    }
  });

  console.log(`${logColors.cyan}📸 Found ${imageUrls.length} image URLs before cleanup${logColors.reset}`);

  // שלב 2: חילוץ URL של הדף (לינק ספק)
  let pageUrl = '';
  const urlMatch = html.match(/https?:\/\/(www\.)?(dkny|katespade|coach|amazon|aliexpress)[^\s"'<>]+/i);
  if (urlMatch) {
    pageUrl = urlMatch[0];
    console.log(`${logColors.cyan}🔗 Found page URL: ${pageUrl.substring(0, 50)}...${logColors.reset}`);
  }

  let cleaned = html
    // 1. הסרת תגיות סקריפט עם כל התוכן שלהן
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, "")
    // 2. הסרת תגיות סטייל עם כל התוכן שלהן
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, "")
    // 3. הסרת הערות HTML
    .replace(/<!--[\s\S]*?-->/g, "")
    // 4. הסרת תגיות SVG (אייקונים שתופסים המון מקום)
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gmi, "")
    // 5. הסרת תגיות noscript
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gmi, "")
    // 6. הסרת תגיות head (מטא-דאטה לא רלוונטי)
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gmi, "")
    // 7. הסרת תגיות iframe
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gmi, "")
    // 8. הסרת data attributes ארוכים (אבל לא data-src!)
    .replace(/\s+data-(?!src)[a-z-]+="[^"]*"/gmi, "")
    // 9. הסרת class attributes ארוכים
    .replace(/\s+class="[^"]*"/gmi, " ")
    // 10. הסרת style attributes
    .replace(/\s+style="[^"]*"/gmi, "")
    // 11. הסרת onclick וכו'
    .replace(/\s+on[a-z]+="[^"]*"/gmi, "")
    // 12. המרת תגיות HTML לרווחים (שמירה על טקסט)
    .replace(/<[^>]+>/g, " ")
    // 13. המרת HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    // 14. ניקוי רווחים כפולים
    .replace(/\s+/g, " ")
    // 15. ניקוי שורות ריקות
    .replace(/\n\s*\n/g, "\n")
    .trim();

  // שלב 3: הוספת רשימת התמונות וה-URL בסוף הטקסט הנקי
  if (imageUrls.length > 0) {
    cleaned += "\n\n=== EXTRACTED IMAGE URLS ===\n";
    imageUrls.slice(0, 20).forEach((url, idx) => { // מקסימום 20 תמונות
      cleaned += `IMAGE_${idx + 1}: ${url}\n`;
    });
  }

  if (pageUrl) {
    cleaned += `\n=== PAGE URL ===\nSUPPLIER_URL: ${pageUrl}\n`;
  }

  // הגבלה ל-150,000 תווים (מספיק לכל מוצר, חוסך טוקנים)
  const MAX_CHARS = 150000;
  if (cleaned.length > MAX_CHARS) {
    cleaned = cleaned.substring(0, MAX_CHARS);
    console.log(`${logColors.yellow}⚠️ Text truncated to ${MAX_CHARS.toLocaleString()} chars${logColors.reset}`);
  }

  const reduction = Math.round((1 - cleaned.length / originalLength) * 100);
  console.log(`${logColors.green}🧹 HTML Cleanup: ${originalLength.toLocaleString()} → ${cleaned.length.toLocaleString()} chars (${reduction}% reduction)${logColors.reset}`);

  return cleaned;
};

// אתחול Gemini רק אם יש מפתח
const getGeminiModel = () => {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    throw new Error('מפתח Gemini API לא הוגדר. נא להוסיף GEMINI_API_KEY לקובץ .env');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" }
  });
};

/**
 * עיבוד טקסט גולמי של מוצר וחילוץ נתונים מובנים
 * @route POST /api/admin/ai/process-product
 */
export const processProductWithAI = async (req, res) => {
  const requestId = Date.now().toString(36); // מזהה ייחודי לבקשה
  const startTime = Date.now();

  try {
    const { rawData } = req.body;

    logSection(`🤖 AI PRODUCT PROCESSING [${requestId}]`, 'magenta');
    logKeyValue('Request ID', requestId);
    logKeyValue('Timestamp', new Date().toISOString());
    logKeyValue('Raw Data Length', rawData ? `${rawData.length.toLocaleString()} chars` : 'EMPTY');

    if (!rawData || rawData.trim().length < 20) {
      console.log(`${logColors.red}❌ REJECTED: Text too short${logColors.reset}`);
      return res.status(400).json({
        success: false,
        message: 'נא להדביק טקסט מספיק ארוך לעיבוד (לפחות 20 תווים)'
      });
    }

    // ניקוי HTML - מסיר scripts, styles, SVGs וכו' - חוסך 80-90% מהטוקנים!
    let processedData = cleanHtmlData(rawData);

    // הצגת תחילת הטקסט שנשלח
    logBox('📤 INPUT TEXT (first 500 chars)', processedData.substring(0, 500), 'blue');

    logKeyValue('Model', 'gemini-2.0-flash');
    logKeyValue('API Key', process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...` : 'NOT SET');

    console.log(`\n${logColors.cyan}⏳ Sending request to Google Gemini...${logColors.reset}\n`);

    const model = getGeminiModel();

    const prompt = `You are a product catalog expert for TORINO fashion & lifestyle brand.
Task: Extract structured product data from raw supplier text (Amazon, AliExpress, Kate Spade, etc).

IMPORTANT EXTRACTION RULES:
1. Name: Translate to Hebrew (marketing style) + keep original English name
2. Description: Write detailed Hebrew description (3+ paragraphs, marketing) + English description
3. Specifications: Extract brand, model, weight, dimensions, material - everything available
4. Features: List key benefits in Hebrew (5-10 items)
5. Tags: 5-8 relevant Hebrew tags for SEO
6. ASIN: Extract if exists (Amazon product code, usually 10 characters starting with B)
7. SEO: Suggest Hebrew meta title (max 60 chars) and description (max 160 chars)
8. Images: Extract ALL product image URLs (full https://... URLs). Look in src, data-src, srcset attributes
9. Variants: Extract available colors and sizes
10. Rating: Extract rating and review count if available
11. Links: Extract original product page URL

⚠️ CRITICAL PRICE EXTRACTION (MOST IMPORTANT!):
- Search EVERYWHERE for price: "$XX.XX", "USD XX", "Price: XX", numbers near $ symbol
- Look for: sale price, list price, regular price, our price, your price
- If multiple prices found, use the LOWEST one (sale price)
- MUST return a NUMBER like 49.99, NOT null, NOT a string with "$"
- If price is in other currency (₪, €, £), convert to USD estimate

CRITICAL RULES:
- Hebrew description must be marketing-oriented for Israeli customers
- English description should be professional
- For missing text data, use empty string "" not null
- For missing numeric data (price), use 0 not null
- Extract ALL image URLs completely (look for high-res versions)
- Price MUST be a positive number (e.g., 49.99)

Return JSON in this exact structure (no markdown):
{
  "asin": "extract if exists, else null",
  "name_he": "Hebrew name",
  "name_en": "English name",
  "description_he": "Long Hebrew marketing description",
  "description_en": "Professional English description",
  "specifications": {
    "brand": "Brand name",
    "model": "Model/SKU",
    "weight": "Weight",
    "dimensions": "Dimensions",
    "material": "Material/Composition"
  },
  "features": ["Feature 1 in Hebrew", "Feature 2 in Hebrew"],
  "tags": ["tag1", "tag2"],
  "seo": {
    "title": "Hebrew SEO title (max 60 chars)",
    "description": "Hebrew meta description (max 160 chars)",
    "keywords": ["keyword1", "keyword2"]
  },
  "originalPrice": {
    "usd": 49.99
  },
  "images": [
    {
      "url": "https://full-image-url...",
      "alt": "Image description",
      "isPrimary": true
    }
  ],
  "variants": [
    {
      "color": "Black",
      "size": "M",
      "sku": "SKU-123"
    }
  ],
  "availableColors": ["Black", "White", "Blue"],
  "availableSizes": ["S", "M", "L", "XL"],
  "rating": {
    "average": 4.5,
    "count": 1234,
    "amazonRating": 4.5,
    "amazonReviewsCount": 1234
  },
  "links": {
    "amazon": "https://amazon.com/...",
    "supplierUrl": "https://..."
  },
  "shipping": {
    "estimatedDays": 14,
    "freeShipping": false
  }
}

Source text from supplier:
${processedData}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const duration = Date.now() - startTime;

    logSection(`📥 GEMINI RESPONSE [${requestId}]`, 'green');
    logKeyValue('Duration', `${duration}ms`);
    logKeyValue('Response Length', `${text.length.toLocaleString()} chars`);

    // הצגת התגובה הגולמית
    logBox('📥 RAW RESPONSE FROM GEMINI', text.substring(0, 1500), 'green');

    // ניקוי תגיות Markdown ותווי שליטה לא חוקיים
    let cleanJson = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    // ניקוי תווי שליטה בתוך מחרוזות JSON (newlines, tabs, etc.)
    // מחליף newlines בתוך מחרוזות ב-\\n
    cleanJson = cleanJson.replace(/"([^"]*(?:\\.[^"]*)*)"/g, (match) => {
      return match
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    });

    let parsedData;
    try {
      parsedData = JSON.parse(cleanJson);
      console.log(`${logColors.green}✅ JSON PARSED SUCCESSFULLY${logColors.reset}`);
    } catch (parseError) {
      logSection(`❌ JSON PARSE ERROR [${requestId}]`, 'red');
      console.log(`${logColors.red}Parse Error: ${parseError.message}${logColors.reset}`);
      logBox('❌ INVALID JSON RESPONSE', cleanJson.substring(0, 1000), 'red');

      // ניסיון שני - ניקוי אגרסיבי יותר
      try {
        console.log(`${logColors.yellow}⚠️ Trying aggressive cleanup...${logColors.reset}`);
        const aggressiveClean = text
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .replace(/[\x00-\x1F\x7F]/g, ' ') // החלף כל תווי שליטה ברווח
          .trim();
        parsedData = JSON.parse(aggressiveClean);
        console.log(`${logColors.green}✅ JSON PARSED after aggressive cleanup${logColors.reset}`);
      } catch (secondError) {
        console.log(`${logColors.red}Second parse also failed: ${secondError.message}${logColors.reset}`);
        return res.status(500).json({
          success: false,
          message: 'שגיאה בפענוח תגובת ה-AI. נסה שוב.'
        });
      }
    }

    // אם התוצאה היא מערך, קח את האיבר הראשון
    if (Array.isArray(parsedData)) {
      console.log(`${logColors.yellow}⚠️ Response was array, taking first element${logColors.reset}`);
      parsedData = parsedData[0];
    }

    // הצגת הנתונים שחולצו
    logBox('✅ EXTRACTED DATA', JSON.stringify(parsedData, null, 2), 'green');

    // ולידציה בסיסית של התוצאה
    if (!parsedData || !parsedData.name_he || !parsedData.description_he) {
      console.log(`${logColors.yellow}⚠️ Missing required fields (name_he or description_he)${logColors.reset}`);
      return res.status(400).json({
        success: false,
        message: 'ה-AI לא הצליח לחלץ מספיק מידע מהטקסט. נסה להדביק טקסט מפורט יותר.'
      });
    }

    logSection(`✅ SUCCESS [${requestId}] - ${duration}ms`, 'green');
    console.log(`${logColors.green}${logColors.bright}🎉 Product processed successfully!${logColors.reset}`);
    logKeyValue('Hebrew Name', parsedData.name_he);
    logKeyValue('English Name', parsedData.name_en || 'N/A');
    logKeyValue('Features Count', parsedData.features?.length || 0);
    logKeyValue('Tags Count', parsedData.tags?.length || 0);

    res.json({
      success: true,
      data: parsedData,
      message: 'הנתונים עובדו בהצלחה! אנא בדוק ועדכן לפי הצורך.'
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    logSection(`❌ ERROR [${requestId}] - ${duration}ms`, 'red');
    console.log(`${logColors.red}${logColors.bright}Error Type: ${error.constructor.name}${logColors.reset}`);
    console.log(`${logColors.red}Error Message: ${error.message}${logColors.reset}`);

    if (error.stack) {
      logBox('❌ ERROR STACK', error.stack, 'red');
    }

    // הצגת פרטי השגיאה המלאים
    if (error.response) {
      logBox('❌ ERROR RESPONSE', JSON.stringify(error.response, null, 2), 'red');
    }

    // טיפול בשגיאות ספציפיות
    if (error.message?.includes('API key') || error.message?.includes('API_KEY')) {
      console.log(`${logColors.red}🔑 API KEY ERROR${logColors.reset}`);
      return res.status(500).json({
        success: false,
        message: 'מפתח API לא תקין. נא לבדוק את הגדרות GEMINI_API_KEY.'
      });
    }

    if (error.message?.includes('quota') || error.message?.includes('rate') || error.message?.includes('429') || error.message?.includes('Resource has been exhausted')) {
      console.log(`${logColors.red}📊 QUOTA/RATE LIMIT ERROR${logColors.reset}`);
      return res.status(429).json({
        success: false,
        message: 'חריגה ממכסת הבקשות. נא להמתין מספר דקות ולנסות שוב.'
      });
    }

    res.status(500).json({
      success: false,
      message: `שגיאה בעיבוד הנתונים: ${error.message}`
    });
  }
};

/**
 * בדיקת סטטוס ה-AI
 * @route GET /api/admin/ai/status
 */
export const getAIStatus = async (req, res) => {
  try {
    const hasApiKey = process.env.GEMINI_API_KEY &&
                      process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE';

    res.json({
      success: true,
      data: {
        enabled: hasApiKey,
        model: 'gemini-1.5-flash',
        provider: 'Google Gemini'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'שגיאה בבדיקת סטטוס AI'
    });
  }
};
