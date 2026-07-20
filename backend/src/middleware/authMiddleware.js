
const AuthService = require('../modules/auth/auth.service');
const prisma = require('../config/db');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login first.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = AuthService.verifyToken(token);

    // The token only proves it was signed by us — it doesn't guarantee
    // the user it points at still exists. That mismatch happens after
    // e.g. `prisma migrate reset`, which wipes and reseeds the users
    // table with new ids while the browser keeps holding an old token.
    // Check here so it fails fast with a clear message instead of
    // surfacing as a foreign key error deep inside checkout/etc.
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Your session is no longer valid. Please log out and log back in.'
      });
    }

    // Attach user info to request
    req.user = decoded;

    next();

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired token'
    });
  }
};

module.exports = authMiddleware;
