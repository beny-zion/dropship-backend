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
 * העלאת Buffer ל-Cloudinary (מתאים ל-multer memory storage)
 * @param {Buffer} buffer - Buffer של הקובץ
 * @param {string} folder - תיקיה ב-Cloudinary (אופציונלי)
 * @returns {Promise<object>} אובייקט עם URL ופרטים נוספים
 */
export const uploadBufferToCloudinary = (buffer, folder = process.env.CLOUDINARY_FOLDER) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'auto',
        quality: 'auto:good',
        transformation: [
          { width: 1920, height: 1920, crop: 'limit' },
          { quality: 'auto:good' },
        ]
      },
      (error, result) => {
        if (error) {
          console.error('שגיאה בהעלאת buffer ל-Cloudinary:', error);
          return reject(new Error('שגיאה בהעלאת הקובץ'));
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          resourceType: result.resource_type
        });
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * העלאת תמונת Hero באיכות גבוהה מאוד (ללא דחיסה)
 * @param {string} file - נתיב הקובץ או base64 string
 * @param {string} folder - תיקיה ב-Cloudinary
 * @returns {Promise<object>} אובייקט עם URL ופרטים נוספים
 */
export const uploadHeroImage = async (file, folder = 'homepage/heroes') => {
  try {
    const result = await cloudinary.uploader.upload(file, {
      folder: folder,
      resource_type: 'image', // מאלץ את Cloudinary לטפל בזה כתמונה (כולל SVG)
      quality: 100, // איכות מקסימלית - 100%
      flags: 'preserve_transparency', // שמירה על שקיפות (לSVG/PNG)
      invalidate: true, // מבטל cache ישן
      // ללא טרנספורמציות - שומרים את הגודל המקורי
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      resourceType: result.resource_type,
      bytes: result.bytes
    };
  } catch (error) {
    console.error('שגיאה בהעלאת תמונת Hero:', error);
    throw new Error('שגיאה בהעלאת תמונת Hero');
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

// Alias for deleteImage
export const deleteFromCloudinary = deleteImage;

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
