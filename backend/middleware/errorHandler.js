const { redactCredentials } = require('../config/database');

function errorHandler(error, req, res, next) {
  let status = error.status || 500;
  let message = error.message || 'An unexpected server error occurred.';

  // Prisma known request errors
  if (error.code === 'P2002') {
    status = 409;
    const target = Array.isArray(error.meta && error.meta.target)
      ? error.meta.target.join(', ')
      : (error.meta && error.meta.target) || 'field';
    message = String(target).toLowerCase().includes('email')
      ? 'An account with this email address already exists.'
      : 'A record with this unique value already exists.';
  } else if (error.code === 'P2025') {
    status = 404;
    message = 'The requested record was not found.';
  } else if (error.code === 'P2003') {
    status = 400;
    message = 'The referenced related record does not exist.';
  } else if (
    error.name === 'PrismaClientInitializationError' ||
    ['P1000', 'P1001', 'P1002', 'P1003', 'P1008', 'P1017'].includes(error.code)
  ) {
    status = 503;
    message = 'Database service is currently unavailable. Please ensure MySQL is running and try again.';
  } else if (error.name === 'PrismaClientValidationError') {
    status = 400;
    message = 'The supplied request data is invalid.';
  } else if (error.type === 'entity.too.large') {
    status = 413;
    message = 'The request body is too large.';
  } else if (error.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body must contain valid JSON.';
  } else if (message === 'CORS origin is not allowed.') {
    status = 403;
  }

  if (status >= 500) {
    const safeErr = redactCredentials((error && error.message) || '');
    console.error(`[Server Error ${status}]`, error.name || 'Error', error.code || '', safeErr.split('\n')[0]);
    if (status === 500) {
      message = 'An unexpected server error occurred.';
    }
  }

  res.status(status).json({ success: false, message });
}

module.exports = errorHandler;
