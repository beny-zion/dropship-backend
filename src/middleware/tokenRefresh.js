/**
 * Token Refresh Middleware
 *
 * 🔄 Sliding Session Implementation:
 * - Automatically refreshes JWT token if it's close to expiration
 * - Keeps active users logged in indefinitely
 * - Inactive users are logged out after 30 days
 *
 * How it works:
 * 1. Check if token exists and is valid
 * 2. If token will expire in < 7 days → issue new token
 * 3. New token has full 30 days validity
 * 4. Old token is blacklisted
 */

import jwt from 'jsonwebtoken';
import tokenBlacklist from '../utils/tokenBlacklist.js';

export const refreshTokenIfNeeded = async (req, res, next) => {
  try {
    // Only run if user is authenticated (after auth middleware)
    if (!req.user || !req.token) {
      return next();
    }

    // Decode current token to check expiration
    const decoded = jwt.decode(req.token);
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const timeUntilExpiry = decoded.exp - now; // Seconds until token expires

    // Refresh threshold: 7 days (in seconds)
    const REFRESH_THRESHOLD = 7 * 24 * 60 * 60; // 7 days

    // If token will expire in less than 7 days, issue a new one
    if (timeUntilExpiry < REFRESH_THRESHOLD) {
      console.log(`🔄 Token refresh triggered for user ${req.user._id}`);
      console.log(`   Time until expiry: ${Math.floor(timeUntilExpiry / 86400)} days`);

      // Generate new token
      const newToken = req.user.generateAuthToken();

      // Blacklist old token
      tokenBlacklist.add(req.token, decoded.exp * 1000);

      // Set new cookie
      res.cookie('token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      console.log(`✅ New token issued - expires in 30 days`);
    }

    next();
  } catch (error) {
    // If refresh fails, don't block the request - just log and continue
    console.error('Token refresh error:', error);
    next();
  }
};
