
const PlatformAuthService = require('./platformAuth.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success } = require('../../utils/apiResponse');
const env = require('../../config/env');

const login = asyncHandler(async (req, res) => {
  // Block requests from tenant subdomains
  if (req.tenantBusiness) {
    return res.status(403).json({
      success: false,
      message: 'Platform admin cannot be accessed from a business subdomain. Please use the platform portal.',
    });
  }

  // When APP_DOMAIN is configured, only allow login from the dedicated
  // platformadmin subdomain so the bare domain cannot be used as a
  // back door to the platform admin panel.
  if (env.appDomain && !req.isPlatformAdminSubdomain) {
    const portalUrl = `http://${env.platformSubdomain}.${env.appDomain}/platform/login`;
    return res.status(403).json({
      success: false,
      message: `Platform admin login is only allowed from the dedicated platform portal: ${portalUrl}`,
    });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }
  const result = await PlatformAuthService.login(email, password);
  success(res, result, 'Login successful');
});

const me = asyncHandler(async (req, res) => {
  success(res, req.platformAdmin);
});

module.exports = { login, me };
