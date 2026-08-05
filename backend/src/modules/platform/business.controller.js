const BusinessService = require('./business.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

const getAll = asyncHandler(async (req, res) => {
  const businesses = await BusinessService.getAll();
  success(res, businesses);
});

const getById = asyncHandler(async (req, res) => {
  const business = await BusinessService.getById(req.params.id);
  success(res, business);
});

const create = asyncHandler(async (req, res) => {
  const { name, industryType, contactEmail, contactPhone, adminName, adminEmail, adminPassword, enabledModules } = req.body;
  if (!name || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({
      success: false,
      message: 'name, adminName, adminEmail and adminPassword are required',
    });
  }
  const result = await BusinessService.createBusiness({
    name, industryType, contactEmail, contactPhone, adminName, adminEmail, adminPassword, enabledModules,
  });
  created(res, result, 'Business created');
});

const setStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const business = await BusinessService.setStatus(req.params.id, status);
  success(res, business, 'Status updated');
});

const setModules = asyncHandler(async (req, res) => {
  const { enabledModules } = req.body;
  if (!Array.isArray(enabledModules)) {
    return res.status(400).json({ success: false, message: 'enabledModules must be an array' });
  }
  const business = await BusinessService.setEnabledModules(req.params.id, enabledModules);
  success(res, business, 'Modules updated');
});

const setMaxAdminSeats = asyncHandler(async (req, res) => {
  const { maxAdminSeats } = req.body;
  const business = await BusinessService.setMaxAdminSeats(req.params.id, maxAdminSeats);
  success(res, business, 'Admin seat limit updated');
});

const resetPrimaryAdminPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'newPassword must be at least 6 characters' });
  }
  const result = await BusinessService.resetPrimaryAdminPassword(req.params.id, newPassword);
  success(res, result, 'Password reset');
});

// New — lets a Super Admin edit the descriptive/contact info captured
// when a business was first created (name, industry, contact email/
// phone). Deliberately a separate endpoint from setStatus/setModules/
// setMaxAdminSeats/resetPrimaryAdminPassword above, all of which stay
// exactly as they were.
const updateInfo = asyncHandler(async (req, res) => {
  const { name, industryType, contactEmail, contactPhone } = req.body;
  const business = await BusinessService.updateBusinessInfo(req.params.id, {
    name, industryType, contactEmail, contactPhone,
  });
  success(res, business, 'Business info updated');
});

module.exports = {
  getAll, getById, create, setStatus, setModules, setMaxAdminSeats, resetPrimaryAdminPassword, updateInfo,
};