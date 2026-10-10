import crypto from 'node:crypto'; //node builtin library to generate crypto secure UUIDs

/**
 * In-Memory User & Session Repository.
 *
 * Implements the data access layer interface for authentication.
 * Uses native Map structures to simulate relational indexes (by id, email, rollNumber).
 * All methods are async to ensure seamless migration to PostgreSQL repositories later.
 */
class AuthRepository {
  constructor() {
    // Primary storage: Map<id, User>
    this.users = new Map();
    // Index: email -> id
    this.emailIndex = new Map();
    // Index: `${universityId}:${rollNumber}` -> id
    this.rollIndex = new Map();
    // Storage for active hashed refresh tokens: Map<hashedToken, { userId, expiresAt, createdAt, deviceId }>
    this.refreshTokens = new Map();
  }

  /**
   * Find a user by their unique UUID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  /**
   * Find a user by email address (case-insensitive).
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email) {
    const normalizedEmail = email.toLowerCase();
    const userId = this.emailIndex.get(normalizedEmail);
    if (!userId) return null;
    return this.findById(userId);
  }

  /**
   * Find a user by university ID and roll number.
   * @param {string} universityId
   * @param {string} rollNumber
   * @returns {Promise<Object|null>}
   */
  async findByRollNumber(universityId, rollNumber) {
    const key = `${universityId}:${rollNumber}`;
    const userId = this.rollIndex.get(key);
    if (!userId) return null;
    return this.findById(userId);
  }

  /**
   * Insert a new user into storage.
   * @param {Object} userData
   * @returns {Promise<Object>} The created user record
   */
  async createUser(userData) {
    const id = crypto.randomUUID();
    const now = new Date();

    const user = {
      id,
      universityId: userData.universityId,
      rollNumber: userData.rollNumber,
      email: userData.email.toLowerCase(),
      fullName: userData.fullName,
      passwordHash: userData.passwordHash,
      role: userData.role || 'student',
      status: userData.status || 'pending_verification',
      phone: userData.phone || null,
      gender: userData.gender || null,
      photoUrl: userData.photoUrl || null,
      hostelId: userData.hostelId || null,
      roomId: userData.roomId || null,
      bedId: userData.bedId || null,
      tokenVersion: 1,
      totpSecret: null,
      totpEnabled: false,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(id, user);
    this.emailIndex.set(user.email, id);
    this.rollIndex.set(`${user.universityId}:${user.rollNumber}`, id);

    return { ...user };
  }
}

// Export singleton instance for the auth module
export const authRepository = new AuthRepository();
