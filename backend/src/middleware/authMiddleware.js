const AuthService = require('../modules/auth/auth.service');
const prisma = require('../config/db');
const { ROUTE_MODULE_MAP } = require('../config/modules');

// Tenant auth middleware — used on every ordinary /api/* route (never
// on /api/platform/*, which uses platformAuthMiddleware.js instead).
// Besides verifying the token, this is where the request's tenant
// context gets established for the rest of the request (see
// config/db.js) and where a suspended business gets blocked before it
// can touch any of its own data.
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

    if (decoded.platform) {
      return res.status(403).json({
        success: false,
        message: 'This is a platform token — it can\'t be used on business routes.'
      });
    }

    // The token only proves it was signed by us — it doesn't guarantee
    // the user it points at still exists. That mismatch happens after
    // e.g. `prisma migrate reset`, which wipes and reseeds the users
    // table with new ids while the browser keeps holding an old token.
    // Check here so it fails fast with a clear message instead of
    // surfacing as a foreign key error deep inside checkout/etc.
    //
    // Looked up by id alone (no tenant context exists yet at this
    // point in the request — this IS how it gets established, below),
    // which is safe: id is globally unique regardless of business.
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Your session is no longer valid. Please log out and log back in.'
      });
    }

    // Confirm the business this user belongs to is actually active.
    // Checked against the live Business row (not just trusting a claim
    // baked into the token at login time), so a business suspended
    // mid-session is blocked on the very next request, not just at
    // next login.
    const business = await prisma.basePrisma.business.findUnique({ where: { id: user.business_id } });
    if (!business || business.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'This business account is not active. Please contact support.'
      });
    }

    // req.tenantBusiness is set by tenantMiddleware.js from the
    // request's subdomain, and is null when the request has no
    // recognizable subdomain (e.g. bare APP_DOMAIN, or local dev with
    // no APP_DOMAIN configured) — in that case there's nothing to
    // enforce, same as before subdomains existed at all. When a
    // subdomain WAS resolved, a token minted for a different business
    // must not be usable there — this is what stops a leaked/copied
    // token (or a browser tab left open) from reaching another
    // client's subdomain even though the JWT itself is still valid.
    if (req.tenantBusiness && req.tenantBusiness.id !== user.business_id) {
      return res.status(403).json({
        success: false,
        message: 'Your account does not belong to this business.'
      });
    }

    // Module gate — is this whole feature area even enabled for this
    // business, regardless of the user's role/permissions? Checked by
    // route mount path (req.baseUrl, e.g. "/api/products"); routes not
    // in the map (auth, profile, dashboard, settings...) are core and
    // always allowed. See config/modules.js.
    const requiredModule = ROUTE_MODULE_MAP[req.baseUrl];
    if (requiredModule && !business.enabled_modules.includes(requiredModule)) {
      return res.status(403).json({
        success: false,
        message: 'This feature isn\'t enabled for your business plan.'
      });
    }

    // Attach user info to request
    req.user = decoded;
    req.business = business;

    // Everything downstream of this point (permission checks, the
    // actual route handler, and every Prisma query any of them make)
    // runs inside this tenant context — see config/db.js.
    prisma.runWithTenant(user.business_id, () => next());

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired token'
    });
  }
};

module.exports = authMiddleware;