import crypto from 'crypto'; //node.js builtin library fro cryptographic operations(generating random bytes and hashing)
import jwt from 'jsonwebtoken'; //library for signing and verifying json web token
import env from '../config/env.js';

/**
 * Generate a short-lived JWT access token (15m default)
 * @param {Object} payload - Token claims (sub, role, hostelIds, tokenVersion, etc.)
 * @returns {string} - Signed JWT string
 */
//These are JSDoc comments, used to documents the fucntion to understand the what parameters a function expects and the type they are and what the fucntion returns.
//@params declare that you're describing an input parameter


//creates a jwt signed token containign user's data as payload, actual secret and expiry date. and ultimately returns a signed string
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
};



//validates an incoming jwt from api request
//if validated, returns users's data as payload or returns error
/**
 * Verify a JWT access token
 * @param {string} token - The Bearer token to verify
 * @returns {Object} - Decoded token payload
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
};

/**
 * Generate a cryptographically secure random opaque refresh token
 * @returns {string} - Hex string (64 bytes / 128 hex chars)
 */
export const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

/**
 * Hash a refresh token before storing in DB (to prevent plaintext token leaks on DB breach)
 * @param {string} rawToken - Plaintext refresh token
 * @returns {string} - SHA-256 hash in hex
 */
export const hashToken = (rawToken) => {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
};

/**
 * Calculate expiry date for a refresh token (default 7 days)
 * @param {number} [days] - Number of days until expiry
 * @returns {Date} - Expiration date
 */
export const getRefreshTokenExpiry = (days = env.JWT_REFRESH_EXPIRES_IN_DAYS) => {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
};
