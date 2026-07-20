
const DashboardService = require('./dashboard.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success } = require('../../utils/apiResponse');

class DashboardController {
  getSummary = asyncHandler(async (req, res) => {
    const summary = await DashboardService.getSummary();
    success(res, summary);
  });
}

module.exports = new DashboardController();
