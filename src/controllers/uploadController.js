import { uploadImage, deleteImage, validateImageUrl } from '../utils/cloudinary.js';

/**
 * העלאת תמונה ל-Cloudinary
 * POST /api/upload/image
 */
export const uploadProductImage = async (req, res) => {
  try {
    const { file, fileData } = req.body;

    if (!file && !fileData) {
      return res.status(400).json({
        success: false,
        message: 'לא נשלח קובץ להעלאה'
      });
    }

    // העלאה ל-Cloudinary
    const result = await uploadImage(file || fileData);

    res.status(200).json({
      success: true,
      data: {
        url: result.url,
        publicId: result.publicId,
        width: result.width,
        height: result.height
      },
      message: 'התמונה הועלתה בהצלחה'
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'שגיאה בהעלאת התמונה'
    });
  }
};

/**
 * מחיקת תמונה מ-Cloudinary
 * DELETE /api/upload/image/:publicId
 */
export const deleteProductImage = async (req, res) => {
  try {
    const { publicId } = req.params;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'לא נשלח מזהה תמונה'
      });
    }

    // מחיקה מ-Cloudinary
    const result = await deleteImage(publicId);

    res.status(200).json({
      success: true,
      data: result,
      message: 'התמונה נמחקה בהצלחה'
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'שגיאה במחיקת התמונה'
    });
  }
};

/**
 * אימות URL של תמונה חיצונית
 * POST /api/upload/validate-url
 */
export const validateImageURL = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'לא נשלח URL'
      });
    }

    // בדיקה שזה URL תקין
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'URL לא תקין'
      });
    }

    // אימות שזו תמונה תקינה
    const isValid = await validateImageUrl(url);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'URL לא מוביל לתמונה תקינה'
      });
    }

    res.status(200).json({
      success: true,
      data: { url, isValid: true },
      message: 'URL תקין'
    });
  } catch (error) {
    console.error('Error validating URL:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'שגיאה באימות ה-URL'
    });
  }
};

/**
 * העלאת מספר תמונות בבת אחת
 * POST /api/upload/images
 */
export const uploadMultipleImages = async (req, res) => {
  try {
    const { files } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'לא נשלחו קבצים להעלאה'
      });
    }

    const maxImages = parseInt(process.env.MAX_IMAGES_PER_PRODUCT) || 5;
    if (files.length > maxImages) {
      return res.status(400).json({
        success: false,
        message: `ניתן להעלות עד ${maxImages} תמונות בלבד`
      });
    }

    // העלאה של כל התמונות
    const uploadPromises = files.map(file => uploadImage(file));
    const results = await Promise.all(uploadPromises);

    const uploadedImages = results.map(result => ({
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height
    }));

    res.status(200).json({
      success: true,
      data: uploadedImages,
      message: `${uploadedImages.length} תמונות הועלו בהצלחה`
    });
  } catch (error) {
    console.error('Error uploading multiple images:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'שגיאה בהעלאת התמונות'
    });
  }
};
