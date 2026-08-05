const ProfileService = require('./profile.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success } = require('../../utils/apiResponse');

class ProfileController {
  getProfile = asyncHandler(async (req, res) => {
    const profile = await ProfileService.getProfile(req.user.userId);
    success(res, profile);
  });

  updateProfile = asyncHandler(async (req, res) => {
    const profile = await ProfileService.updateProfile(req.user.userId, req.body);
    success(res, profile, 'Profile updated');
  });

  updateAvatar = asyncHandler(async (req, res) => {
    const profile = await ProfileService.updateAvatar(req.user.userId, req.file);
    success(res, profile, 'Avatar updated');
  });

  removeAvatar = asyncHandler(async (req, res) => {
    const profile = await ProfileService.removeAvatar(req.user.userId);
    success(res, profile, 'Avatar removed');
  });

  updateTheme = asyncHandler(async (req, res) => {
    const result = await ProfileService.updateTheme(req.user.userId, req.body.theme);
    success(res, result, 'Theme updated');
  });

  changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await ProfileService.changePassword(req.user.userId, { currentPassword, newPassword });
    success(res, null, 'Password changed');
  });
}

module.exports = new ProfileController();