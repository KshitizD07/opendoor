//password.js is a dedicated utility module responsible for password hashing and verification. 


import argon2 from 'argon2'; // the best hasing algo out there


//converts a plain text password into a salted, cryptograpically secure hash string before storing it in database.
/**
 * Hash a plain text password using Argon2id
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password string
 */
export const hashPassword = async (password) => {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,         // 3 iterations
    parallelism: 1,
  });
};

/**
 * Verify a plain text password against an Argon2id hash
 * @param {string} hash - The stored Argon2id hash
 * @param {string} password - Plain text password to verify
 * @returns {Promise<boolean>} - True if password matches hash, false otherwise
 */
export const verifyPassword = async (hash, password) => {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
};
//the user provides a plain password and the system will verify the password against a stored hash, if verification fails the system simply returns false and we return 401 unauthorized.
