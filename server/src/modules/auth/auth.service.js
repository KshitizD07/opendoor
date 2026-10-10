import { authRepository } from './auth.repository.js';
import { hashPassword } from '../../utils/password.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Strips sensitive security fields from the user record before sending in response.
 * @param {Object} user
 * @returns {Object} Sanitized user profile
 */
export const sanitizeUser = (user) => {
  const {
    passwordHash,
    totpSecret,
    resetTokenHash,
    resetExpiresAt,
    ...safeUser
  } = user;
  return safeUser;
};//strips sensitive data fron the user object before sending it in api response, therefore sending safeUSer

/**
 * Authentication Business Logic Service.
 */
class AuthService { //we're using class and singleton pattern here
  /**
   * Register a new student account.
   * - Validates email and roll number uniqueness within the university.
   * - Hashes the plain-text password using Argon2id.
   * - Sets initial state to 'pending_verification'.
   *
   * @param {Object} registrationData
   * @returns {Promise<Object>} Sanitized user object
   */
  async register(registrationData) {
    const { universityId, rollNumber, email, password, fullName, phone, gender } = registrationData;

    // 1. Check if email is already registered
    const existingEmailUser = await authRepository.findByEmail(email);
    if (existingEmailUser) {
      throw new AppError('Email address is already in use', 409);
    }

    // 2. Check if roll number already exists for this university
    const existingRollUser = await authRepository.findByRollNumber(universityId, rollNumber);
    if (existingRollUser) {
      throw new AppError('Roll number already registered for this university', 409);
    }

    // 3. Hash password using Argon2id (memory-hard, resistant to GPU attacks)
    const passwordHash = await hashPassword(password);

    // 4. Persist user with default 'student' role and 'pending_verification' status
    const newUser = await authRepository.createUser({
      universityId,
      rollNumber,
      email,
      passwordHash,
      fullName,
      phone,
      gender,
      role: 'student',
      status: 'pending_verification',
    });

    return sanitizeUser(newUser);
  }
}

export const authService = new AuthService();
