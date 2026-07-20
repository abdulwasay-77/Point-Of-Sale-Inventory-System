
const logger = require('../utils/logger');

// Central error handler — mounted last in app.js. Any controller that
// calls next(error) (or throws inside an async handler wrapped by
// asyncHandler) ends up here.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logger.error(`${req.method} ${req.originalUrl} ->`, err.message);

  // Prisma "record not found" style errors
  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }
  // Prisma unique constraint violation
  if (err.code === 'P2002') {
    const field = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
    return res.status(409).json({ success: false, message: `${field || 'Field'} already exists` });
  }
  // Prisma foreign key constraint violation. Most commonly hit when a
  // logged-in user's JWT still references a user id that no longer
  // exists in the database — e.g. right after `prisma migrate reset`
  // wipes and reseeds the users table with new ids, but the browser is
  // still holding an old token. Surface a message that tells the user
  // what to actually do instead of a raw Prisma stack trace.
  if (err.code === 'P2003') {
    const field = err.meta?.field_name || '';
    if (field.includes('created_by') || field.includes('user')) {
      return res.status(401).json({
        success: false,
        message: 'Your session refers to an account that no longer exists (likely after a database reset). Please log out and log back in.',
      });
    }
    return res.status(409).json({
      success: false,
      message: 'This action references a record that no longer exists.',
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
}

module.exports = errorHandler;
