import multer from 'multer';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';

// Use memory storage - files will be stored in memory as Buffer objects
const storage = multer.memoryStorage();

// File filter to validate file types
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedVideoTypes = /mp4|mov|avi/;

  const extname = allowedImageTypes.test(path.extname(file.originalname).toLowerCase()) ||
                  allowedVideoTypes.test(path.extname(file.originalname).toLowerCase());

  const mimetype = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('רק קבצי תמונה ווידאו מורשים (JPEG, PNG, GIF, WebP, MP4, MOV)'));
  }
};

// Configure multer
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: fileFilter,
});

// Error handler for multer errors
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'הקובץ גדול מדי. גודל מקסימלי: 50MB',
      });
    }
    return res.status(400).json({
      success: false,
      message: `שגיאה בהעלאת הקובץ: ${err.message}`,
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'שגיאה בהעלאת הקובץ',
    });
  }
  next();
};

export default upload;
