import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { registerSchema } from './auth.schema.js';

const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Public student account registration
 * @access  Public
 */
router.post(
  '/register',
  validate(registerSchema),
  authController.register.bind(authController)
);

export default router;
