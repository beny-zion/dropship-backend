import axios from 'axios';
import User from '../models/User.js';

// @desc    Initiate Google OAuth flow
// @route   GET /api/auth/google
// @access  Public
export const googleAuth = (req, res) => {
  const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'profile email',
    access_type: 'offline',
    prompt: 'consent'
  });

  res.redirect(`${googleAuthUrl}?${params.toString()}`);
};

// @desc    Handle Google OAuth callback
// @route   GET /api/auth/google/callback
// @access  Public
export const googleCallback = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
    }

    // Exchange authorization code for access token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code'
    });

    const { access_token } = tokenResponse.data;

    // Get user info from Google
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const { id, email, given_name, family_name } = userInfoResponse.data;

    // Check if user exists with this Google ID or email
    let user = await User.findOne({
      $or: [
        { googleId: id },
        { email: email }
      ]
    });

    if (user) {
      // User exists - update Google ID if needed
      if (!user.googleId) {
        user.googleId = id;
        user.authProvider = 'google';
        await user.save();
      }

      // Update last login
      user.lastLogin = Date.now();
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        email,
        firstName: given_name || 'משתמש',
        lastName: family_name || given_name || 'Google', // Use first name as last name if not provided
        googleId: id,
        authProvider: 'google',
        // phone is optional - will be collected at checkout
        lastLogin: Date.now()
      });
    }

    // Generate JWT token
    const token = user.generateAuthToken();

    // 🍪 Set HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 🔑 'none' for cross-site cookies in production
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Redirect to frontend homepage with success
    res.redirect(`${process.env.FRONTEND_URL}/`);
  } catch (error) {
    console.error('Google OAuth callback error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
};
