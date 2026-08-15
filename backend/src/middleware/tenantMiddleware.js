const prisma = require('../config/db');
const env = require('../config/env');

// Subdomains that are never treated as a business slug, even though
// they technically sit in front of APP_DOMAIN. "www" is the classic
// bare-domain alias; "api"/"platform"/"app" are reserved for
// non-tenant surfaces (a marketing site, the Super Admin platform
// console, etc.) that might one day live on their own subdomain
// without needing a matching Business row.
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'platform', 'app']);

// Resolves which Business a request belongs to, purely from the
// hostname it came in on — e.g. "alimobiles.pos.com" -> slug
// "alimobiles" -> the matching Business row. This is what makes
// abc.pos.com and xyz.pos.com behave as separate tenants without any
// per-client code or deployment changes: onboarding a new client is
// just inserting a Business row with a new slug (see
// platform/business.service.js#createBusiness).
//
// Deliberately domain-agnostic: APP_DOMAIN is read from config/env.js
// (backed by the APP_DOMAIN environment variable), never hardcoded
// here. Whatever real domain eventually gets purchased, this file
// does not change — only the .env value does.
//
// Runs BEFORE authMiddleware, and on every request (including
// unauthenticated ones like /api/settings/public and /api/auth/login)
// because both need to know the tenant before a user/token is
// involved. It does NOT replace authMiddleware's own tenant-scoping
// (see config/db.js runWithTenant) — that still only starts once a
// real logged-in user is confirmed. This middleware's job is narrower:
// figure out "which business does this HOSTNAME claim to be", so that
// (a) the public branding endpoint can answer correctly, and (b) login
// can be rejected if someone's credentials belong to a different
// business than the subdomain they're signing in on.
//
// req.tenantBusiness is null (not an error) when the request has no
// recognizable subdomain — hitting the bare APP_DOMAIN, a reserved
// subdomain, or plain "localhost" in local dev without any hosts-file
// entry all fall back to this. That keeps single-tenant/local
// development working exactly as it did before this middleware existed.
async function tenantMiddleware(req, res, next) {
  try {
    const hostname = req.hostname; // Express strips the port already

    req.tenantBusiness = null;
    req.tenantSlug = null;

    if (!hostname || !env.appDomain) {
      return next();
    }

    // Exact match on the bare domain (e.g. hostname === "pos.com") or
    // any hostname that isn't actually a subdomain of it (e.g. plain
    // "localhost" when APP_DOMAIN="pos.com") -> no tenant, not an error.
    const suffix = `.${env.appDomain}`;
    if (hostname === env.appDomain || !hostname.endsWith(suffix)) {
      return next();
    }

    const slug = hostname.slice(0, -suffix.length);

    // A dotted remainder (e.g. "foo.bar.pos.com") isn't a single valid
    // slug — treat it as "no tenant" rather than guessing.
    if (!slug || slug.includes('.') || RESERVED_SUBDOMAINS.has(slug)) {
      return next();
    }

    // Unscoped on purpose — Business isn't a tenant-scoped model (see
    // config/db.js TENANT_MODELS) and there is no tenant context yet;
    // resolving one from the URL is literally this middleware's job.
    const business = await prisma.basePrisma.business.findUnique({ where: { slug } });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: `No business found for "${slug}". Check the web address and try again.`,
      });
    }

    if (business.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'This business account is not active. Please contact support.',
      });
    }

    req.tenantBusiness = business;
    req.tenantSlug = slug;

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = tenantMiddleware;