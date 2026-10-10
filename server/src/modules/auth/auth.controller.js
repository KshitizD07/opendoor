import { authService } from './auth.service.js';
import { sendCreated } from '../../utils/response.js';

/**
 * Auth Controller Handling HTTP Endpoints for the Auth Module.
 */
class AuthController {
  /**
   * Public Student Registration
   * Route: POST /api/v1/auth/register
   */
  async register(req, res, next) {
    try {
      const user = await authService.register(req.body);
      return sendCreated(
        res,
        user,
        'Registration successful. Your account is pending verification.'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
