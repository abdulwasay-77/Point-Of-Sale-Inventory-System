
const PlatformAuthService = require('./platformAuth.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success } = require('../../utils/apiResponse');

const login = asyncHandler(async (req, res) => {
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
