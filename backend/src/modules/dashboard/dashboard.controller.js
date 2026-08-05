const DashboardService = require('./dashboard.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success } = require('../../utils/apiResponse');

class DashboardController {
  getSummary = asyncHandler(async (req, res) => {
    const summary = await DashboardService.getSummary();
    success(res, summary);
  });

  getSalesChart = asyncHandler(async (req, res) => {
    const { period } = req.query;
    const data = await DashboardService.getSalesChart(period);
    success(res, data);
  });

  getRecentSales = asyncHandler(async (req, res) => {
    const { limit } = req.query;
    const data = await DashboardService.getRecentSales(limit);
    success(res, data);
  });
}

module.exports = new DashboardController();