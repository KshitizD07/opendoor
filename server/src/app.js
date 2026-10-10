import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import env from './config/env.js';
import AppError from './utils/AppError.js';
import { sendSuccess } from './utils/response.js';
import errorHandler from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

// Logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Base API Router
const apiRouter = express.Router();

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  return sendSuccess(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    uptime: `${Math.floor(process.uptime())}s`,
  }, 'Opendoor API is running');
});

// Domain Module Routes
apiRouter.use('/auth', authRoutes);

// Mount /api/v1 prefix
app.use('/api/v1', apiRouter);

// Root route
app.get('/', (req, res) => {
  return sendSuccess(res, {
    project: 'Opendoor Hostel Management & GatePass API',
    version: '1.0.0',
    docs: '/api/v1/health',
  });
});

// 404 Handler
app.use('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler Middleware
app.use(errorHandler);

export default app;
