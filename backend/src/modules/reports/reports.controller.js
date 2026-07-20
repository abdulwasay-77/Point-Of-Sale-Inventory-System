
const ReportsService = require('./reports.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success } = require('../../utils/apiResponse');

class ReportsController {
  todaySales = asyncHandler(async (req, res) => {
    const report = await ReportsService.todaySales();
    success(res, report);
  });

  monthlySales = asyncHandler(async (req, res) => {
    const { month, year } = req.query;
    const report = await ReportsService.monthlySales(month, year);
    success(res, report);
  });

  lowStock = asyncHandler(async (req, res) => {
    const report = await ReportsService.lowStock();
    success(res, report);
  });
}

module.exports = new ReportsController();
