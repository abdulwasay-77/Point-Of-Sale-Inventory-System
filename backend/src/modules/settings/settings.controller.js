const SettingsService = require('./settings.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success } = require('../../utils/apiResponse');

class SettingsController {
  getSettings = asyncHandler(async (req, res) => {
    const settings = await SettingsService.getSettings();
    success(res, settings);
  });

  // Unauthenticated endpoint (see settings.routes.js) — deliberately
  // returns only companyName/logoUrl, never the full settings DTO, since
  // this is reachable by anyone who hasn't logged in yet.
  getPublicSettings = asyncHandler(async (req, res) => {
    const settings = await SettingsService.getPublicSettings();
    success(res, settings);
  });

  updateSettings = asyncHandler(async (req, res) => {
    const settings = await SettingsService.updateSettings(req.body, req.user.userId);
    success(res, settings, 'Settings updated');
  });

  updateLogo = asyncHandler(async (req, res) => {
    const settings = await SettingsService.updateLogo(req.file, req.user.userId);
    success(res, settings, 'Logo updated');
  });

  removeLogo = asyncHandler(async (req, res) => {
    const settings = await SettingsService.removeLogo(req.user.userId);
    success(res, settings, 'Logo removed');
  });

  exportBackup = asyncHandler(async (req, res) => {
    const format = (req.query.format || 'excel').toLowerCase();
    if (format === 'pdf') {
      const buffer = await SettingsService.generatePdfBackup();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="backup-${Date.now()}.pdf"`);
      return res.send(buffer);
    }
    if (format === 'excel') {
      const buffer = await SettingsService.generateExcelBackup();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="backup-${Date.now()}.xlsx"`);
      return res.send(buffer);
    }
    return res.status(400).json({ success: false, message: 'format must be "excel" or "pdf"' });
  });
}

module.exports = new SettingsController();