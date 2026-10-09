//time based one time password using google authenticator 


import { authenticator } from 'otplib';// built in library for standard otp generation and verification 

/**
 * Configure TOTP settings (standard 30s window, 6 digits)
 */
authenticator.options = {
  window: 1, // Allow 1 step before/after for clock drift tolerance
  //giving it a 90 second window, -30 sec, 0, +30 sec
};

/**
 * Generate a new TOTP secret for a user
 * @returns {string} - Base32 encoded secret
 */
export const generateTotpSecret = () => {
  return authenticator.generateSecret();
};
//generates a new random secret key


/**
 * Generate a otpauth:// URI for QR code generation in authenticator apps (e.g., Google Authenticator)
 * @param {string} email - User's email
 * @param {string} secret - User's base32 secret
 * @param {string} [issuer='Opendoor'] - Service name
 * @returns {string} - otpauth URI
 */
export const generateTotpUri = (email, secret, issuer = 'Opendoor') => { // formats the user's email, the service name=opendoor, and their base32 secrert
  //into a uri format and the frontend renders this uri as a qr
  return authenticator.keyuri(email, issuer, secret);
};

/**
 * Verify a 6-digit TOTP token against the secret
 * @param {string} token - 6-digit code entered by user
 * @param {string} secret - User's base32 secret
 * @returns {boolean} - True if valid, false otherwise
 */
export const verifyTotpToken = (token, secret) => {
  if (!token || !secret) return false;
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
};
