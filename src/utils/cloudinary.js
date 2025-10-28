import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// תצורת Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * העלאת תמונה ל-Cloudinary
 * @param {string} file - נתיב הקובץ או base64 string
 * @param {string} folder - תיקיה ב-Cloudinary (אופציונלי)
 * @returns {Promise<object>} אובייקט עם URL ופרטים נוספים
 */
export const uploadImage = async (file, folder = process.env.CLOUDINARY_FOLDER) => {
  try {
    const result = await cloudinary.uploader.upload(file, {
      folder: folder,
      resource_type: 'auto',
      quality: 'auto:good',
      fetch_format: 'auto',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' }, // הגבלת גודל מקסימלי
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      resourceType: result.resource_type
    };
  } catch (error) {
    console.error('שגיאה בהעלאת תמונה ל-Cloudinary:', error);
    throw new Error('שגיאה בהעלאת התמונה');
  }
};

/**
 * מחיקת תמונה מ-Cloudinary
 * @param {string} publicId - מזהה ציבורי של התמונה
 * @returns {Promise<object>}
 */
export const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('שגיאה במחיקת תמונה מ-Cloudinary:', error);
    throw new Error('שגיאה במחיקת התמונה');
  }
};

/**
 * מחיקת מספר תמונות בבת אחת
 * @param {string[]} publicIds - מערך של מזהים ציבוריים
 * @returns {Promise<object>}
 */
export const deleteMultipleImages = async (publicIds) => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds);
    return result;
  } catch (error) {
    console.error('שגיאה במחיקת תמונות מ-Cloudinary:', error);
    throw new Error('שגיאה במחיקת התמונות');
  }
};

/**
 * קבלת פרטי תמונה
 * @param {string} publicId - מזהה ציבורי של התמונה
 * @returns {Promise<object>}
 */
export const getImageDetails = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error) {
    console.error('שגיאה בקבלת פרטי תמונה:', error);
    throw new Error('שגיאה בקבלת פרטי התמונה');
  }
};

/**
 * יצירת URL אופטימלי לתמונה עם טרנספורמציות
 * @param {string} publicId - מזהה ציבורי של התמונה
 * @param {object} options - אופציות טרנספורמציה
 * @returns {string} URL מותאם
 */
export const generateOptimizedUrl = (publicId, options = {}) => {
  const {
    width = 800,
    height = 800,
    crop = 'fill',
    quality = 'auto:good',
    format = 'auto'
  } = options;

  return cloudinary.url(publicId, {
    transformation: [
      { width, height, crop },
      { quality },
      { fetch_format: format }
    ],
    secure: true
  });
};

/**
 * בדיקת תקינות URL של תמונה חיצונית
 * @param {string} url - URL של התמונה
 * @returns {Promise<boolean>}
 */
export const validateImageUrl = async (url) => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    return response.ok && contentType && contentType.startsWith('image/');
  } catch (error) {
    return false;
  }
};

export default cloudinary;
