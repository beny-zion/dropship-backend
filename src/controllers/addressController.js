// controllers/addressController.js - Week 4

import Address from '../models/Address.js';

// @desc    Get all user addresses
// @route   GET /api/users/addresses
// @access  Private
export const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user.id })
      .sort('-isDefault -createdAt');
    
    res.json({
      success: true,
      count: addresses.length,
      data: addresses
    });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת הכתובות'
    });
  }
};

// @desc    Get single address
// @route   GET /api/users/addresses/:id
// @access  Private
export const getAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'כתובת לא נמצאה'
      });
    }

    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error('Get address error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת הכתובת'
    });
  }
};

// @desc    Create new address
// @route   POST /api/users/addresses
// @access  Private
export const createAddress = async (req, res) => {
  try {
    const { fullName, phone, street, apartment, floor, entrance, city, zipCode, label, isDefault } = req.body;

    // Check address limit (max 10 addresses per user)
    const addressCount = await Address.countDocuments({ user: req.user.id });
    if (addressCount >= 10) {
      return res.status(400).json({
        success: false,
        message: 'הגעת למספר המקסימלי של כתובות (10). נא למחוק כתובת קיימת כדי להוסיף חדשה.'
      });
    }

    // Validation
    if (!fullName || !phone || !street || !city || !zipCode) {
      return res.status(400).json({
        success: false,
        message: 'נא למלא את כל השדות הנדרשים'
      });
    }

    // Validate phone
    if (!/^05\d{8}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'מספר טלפון לא תקין'
      });
    }

    // Validate zipCode
    if (!/^\d{7}$/.test(zipCode)) {
      return res.status(400).json({
        success: false,
        message: 'מיקוד חייב להיות 7 ספרות'
      });
    }

    const address = await Address.create({
      user: req.user.id,
      fullName,
      phone,
      street,
      apartment,
      floor,
      entrance,
      city,
      zipCode,
      label: label || 'home',
      isDefault: isDefault || false
    });
    
    res.status(201).json({
      success: true,
      data: address,
      message: 'כתובת נוספה בהצלחה'
    });
  } catch (error) {
    console.error('Create address error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בהוספת כתובת'
    });
  }
};

// @desc    Update address
// @route   PUT /api/users/addresses/:id
// @access  Private
export const updateAddress = async (req, res) => {
  try {
    let address = await Address.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'כתובת לא נמצאה'
      });
    }

    // Validate phone if provided
    if (req.body.phone && !/^05\d{8}$/.test(req.body.phone)) {
      return res.status(400).json({
        success: false,
        message: 'מספר טלפון לא תקין'
      });
    }

    // Validate zipCode if provided
    if (req.body.zipCode && !/^\d{7}$/.test(req.body.zipCode)) {
      return res.status(400).json({
        success: false,
        message: 'מיקוד חייב להיות 7 ספרות'
      });
    }

    // Update fields
    const allowedUpdates = ['fullName', 'phone', 'street', 'apartment', 'floor', 'entrance', 'city', 'zipCode', 'label', 'isDefault'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        address[field] = req.body[field];
      }
    });

    await address.save();
    
    res.json({
      success: true,
      data: address,
      message: 'כתובת עודכנה בהצלחה'
    });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון כתובת'
    });
  }
};

// @desc    Delete address
// @route   DELETE /api/users/addresses/:id
// @access  Private
export const deleteAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'כתובת לא נמצאה'
      });
    }

    // If this is the default address, check if there are other addresses
    if (address.isDefault) {
      const otherAddresses = await Address.countDocuments({
        user: req.user.id,
        _id: { $ne: address._id }
      });

      if (otherAddresses > 0) {
        // Set another address as default
        const newDefault = await Address.findOne({
          user: req.user.id,
          _id: { $ne: address._id }
        });
        if (newDefault) {
          newDefault.isDefault = true;
          await newDefault.save();
        }
      }
    }
    
    await address.deleteOne();
    
    res.json({
      success: true,
      message: 'כתובת נמחקה בהצלחה'
    });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה במחיקת כתובת'
    });
  }
};

// @desc    Set default address
// @route   PUT /api/users/addresses/:id/default
// @access  Private
export const setDefaultAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'כתובת לא נמצאה'
      });
    }

    // If already default, no need to update
    if (address.isDefault) {
      return res.json({
        success: true,
        data: address,
        message: 'כתובת זו כבר מוגדרת כברירת מחדל'
      });
    }
    
    // Remove default from all other addresses
    await Address.updateMany(
      { user: req.user.id },
      { isDefault: false }
    );
    
    // Set this as default
    address.isDefault = true;
    await address.save();
    
    res.json({
      success: true,
      data: address,
      message: 'כתובת ברירת המחדל עודכנה'
    });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בעדכון כתובת ברירת מחדל'
    });
  }
};

// @desc    Get default address
// @route   GET /api/users/addresses/default
// @access  Private
export const getDefaultAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      user: req.user.id,
      isDefault: true
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'לא נמצאה כתובת ברירת מחדל'
      });
    }

    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error('Get default address error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת כתובת ברירת מחדל'
    });
  }
};