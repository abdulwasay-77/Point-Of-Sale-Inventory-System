const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/db');

// Auth for /api/platform/* only. Deliberately a completely separate
// function from authMiddleware.js — not a shared one branching on token
// type — so a bug in one can never accidentally open the other. A
// tenant token is rejected here (no `platform: true` claim); a platform
// token is rejected by authMiddleware.js (has `platform: true`, which
// that middleware explicitly checks for and refuses). Platform requests
// never touch the tenant-scoping context in config/db.js at all — this
// middleware never calls runWithTenant.
const platformAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided. Please login first.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, env.jwtSecret);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    if (!decoded.platform || !decoded.platformAdminId) {
      return res.status(403).json({ success: false, message: 'This is not a platform token.' });
    }

    const admin = await prisma.basePrisma.platformAdmin.findUnique({ where: { id: decoded.platformAdminId } });
    if (!admin || !admin.is_active) {
      return res.status(401).json({ success: false, message: 'Your session is no longer valid. Please log in again.' });
    }

    req.platformAdmin = { id: admin.id, name: admin.name, email: admin.email };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: error.message || 'Invalid or expired token' });
  }
};

module.exports = platformAuthMiddleware;
