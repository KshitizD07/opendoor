import http from 'http';
import app from './app.js';
import env from './config/env.js';
import logger from './utils/logger.js';

const server = http.createServer(app);

server.listen(env.PORT, () => {
  logger.info(`🚀 Opendoor API Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  logger.info(`👉 Health check: http://localhost:${env.PORT}/api/v1/health`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('💥 UNHANDLED REJECTION! Shutting down gracefully...', err);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('💥 UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});

// Graceful shutdown on termination signals
const handleShutdown = (signal) => {
  logger.info(`👋 ${signal} received. Closing HTTP server...`);
  server.close(() => {
    logger.info('💤 HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default server;
