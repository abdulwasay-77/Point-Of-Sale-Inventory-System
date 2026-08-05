const express = require('express');
const SettingsController = require('./settings.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');
const upload = require('../../middleware/upload').logo;

const router = express.Router();

// Unauthenticated on purpose, and registered before authMiddleware below —
// the Login page needs the company name/logo before anyone has signed in.
// Only exposes the two branding fields (see SettingsController.getPublicSettings),
// never the full settings DTO.
router.get('/public', SettingsController.getPublicSettings);

router.use(authMiddleware);

// Reading settings (e.g. currency symbol for display, company name on
// receipts) is needed app-wide, not just by admins — every logged-in
// user can read; only SETTINGS_MANAGE can change anything.
router.get('/', SettingsController.getSettings);
router.put('/', permissionMiddleware(PERMISSIONS.SETTINGS_MANAGE), SettingsController.updateSettings);
router.post('/logo', permissionMiddleware(PERMISSIONS.SETTINGS_MANAGE), upload.single('logo'), SettingsController.updateLogo);
router.delete('/logo', permissionMiddleware(PERMISSIONS.SETTINGS_MANAGE), SettingsController.removeLogo);
router.get('/backup', permissionMiddleware(PERMISSIONS.SETTINGS_MANAGE), SettingsController.exportBackup);

module.exports = router;