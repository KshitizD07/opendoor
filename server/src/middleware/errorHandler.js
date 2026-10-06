import { ZodError } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle Zod Schema Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    error = new AppError('Validation Error', 400, formattedErrors);
  }

  // Handle JWT specific errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token. Please log in again.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Your token has expired. Please log in again.', 401);
  }

  const statusCode = error.statusCode || 500;
  const status = error.status || 'error';
  const message = error.message || 'Internal Server Error';

  if (statusCode >= 500) {
    logger.error('Unhandled Exception:', err);
  } else {
    logger.warn(`Operational Error [${statusCode}]: ${message}`);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error: {
      status,
      statusCode,
      details: error.details || null,
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

export default errorHandler;
