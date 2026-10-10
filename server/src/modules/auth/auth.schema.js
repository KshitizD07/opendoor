import { z } from 'zod';

/**
 * Zod validation schema for user registration (POST /api/v1/auth/register).
 * Validates public student registration payload.
 */
export const registerSchema = z.object({
  body: z.object({
    universityId: z
      .string({ required_error: 'University ID is required' })
      .uuid('University ID must be a valid UUID'),
    
    rollNumber: z
      .string({ required_error: 'Roll number is required' })
      .trim()
      .min(1, 'Roll number cannot be empty')
      .max(50, 'Roll number is too long'),

    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .email('Invalid email address format')
      .toLowerCase(),

    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password is too long'),

    fullName: z
      .string({ required_error: 'Full name is required' })
      .trim()
      .min(2, 'Full name must be at least 2 characters long')
      .max(100, 'Full name is too long'),

    phone: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
      .optional(),

    gender: z
      .enum(['male', 'female', 'other'], {
        errorMap: () => ({ message: "Gender must be 'male', 'female', or 'other'" }),
      })
      .optional(),
  }),
});
