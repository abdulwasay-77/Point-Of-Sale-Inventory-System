

const dotenv = require('dotenv');
dotenv.config();

// No fallback for JWT_SECRET on purpose. A hardcoded default secret
// means anyone who reads the source code (or finds it in a public repo)
// can forge a valid token for any user, including the primary admin — if
// this is ever unset in production, the server should refuse to start
// rather than silently run with a guessable key.
if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Add it to backend/.env before starting the server — see .env.example.'
  );
}

module.exports = {
  port: process.env.PORT || 5000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  nodeEnv: process.env.NODE_ENV || 'development',
  // Root domain subdomain-based tenant resolution is measured against
  // (see middleware/tenantMiddleware.js). "alimobiles.pos.com" is only
  // recognized as the "alimobiles" tenant when APP_DOMAIN="pos.com".
  // Left undefined (rather than defaulted to a guessed value) when
  // unset, so tenantMiddleware can cleanly no-op instead of matching
  // against the wrong domain — e.g. local dev with no subdomains in
  // use at all can simply leave this unset. Never hardcode a domain
  // anywhere else in the codebase; this is the one place it's read.
  appDomain: process.env.APP_DOMAIN || null,
  // The platform owner's dedicated, fixed subdomain — e.g.
  // "abdulwasay.owner" so the full address is
  // "abdulwasay.owner.<APP_DOMAIN>". Unlike business subdomains (any
  // string, matched dynamically against the Business table via
  // wildcard DNS), this is ONE specific, chosen value with no
  // database lookup involved — set once, via env, not created through
  // any UI. Left unset by default; see middleware/tenantMiddleware.js
  // for how it's recognized.
  platformOwnerSubdomain: process.env.PLATFORM_OWNER_SUBDOMAIN || null,
};


