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

  // ---- Generate Reports: Sales section ----

  dailySales = asyncHandler(async (req, res) => {
    const report = await ReportsService.dailySales(req.query.date);
    success(res, report);
  });

  salesByProduct = asyncHandler(async (req, res) => {
    const report = await ReportsService.salesByProduct(req.query);
    success(res, report);
  });

  salesByCategory = asyncHandler(async (req, res) => {
    const report = await ReportsService.salesByCategory(req.query);
    success(res, report);
  });

  salesByVariation = asyncHandler(async (req, res) => {
    const report = await ReportsService.salesByVariation(req.query);
    success(res, report);
  });

  expensesReport = asyncHandler(async (req, res) => {
    const report = await ReportsService.expensesReport(req.query);
    success(res, report);
  });

  invoicesReport = asyncHandler(async (req, res) => {
    const report = await ReportsService.invoicesReport(req.query);
    success(res, report);
  });

  // ---- Generate Reports: Inventory section ----

  stockReport = asyncHandler(async (req, res) => {
    const report = await ReportsService.stockReport();
    success(res, report);
  });

  lowStockReport = asyncHandler(async (req, res) => {
    const report = await ReportsService.lowStockReport();
    success(res, report);
  });

  // ---- Generate Reports: Customer section ----

  customerSummary = asyncHandler(async (req, res) => {
    const report = await ReportsService.customerSummary();
    success(res, report);
  });

  // ---- Generate Reports: shared PDF export ----
  // One route for every report card — reportKey in the URL picks which
  // branch of ReportsService.generateReportPdf runs (see that method for
  // the full list of valid keys). Same response headers as the full data
  // backup in settings.controller.js, just a per-report filename instead
  // of "backup-*".

  downloadReportPdf = asyncHandler(async (req, res) => {
    const { reportKey } = req.params;
    const pdfBuffer = await ReportsService.generateReportPdf(reportKey, req.query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportKey}-${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  });
}

module.exports = new ReportsController();