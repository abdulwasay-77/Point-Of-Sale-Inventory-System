const express = require('express');
const ReportsController = require('./reports.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware, permissionMiddleware(PERMISSIONS.REPORTS_VIEW));

router.get('/today-sales', ReportsController.todaySales);
router.get('/monthly-sales', ReportsController.monthlySales);
router.get('/low-stock', ReportsController.lowStock);

// ---- Generate Reports ----
// Every card on the Generate Reports tab reads from one of these, and
// "Generate PDF" on that same page hits the one shared /pdf/:reportKey
// route below with the same query params — see reports.service.js for
// the full reportKey list.
router.get('/daily-sales', ReportsController.dailySales);
router.get('/sales-by-product', ReportsController.salesByProduct);
router.get('/sales-by-category', ReportsController.salesByCategory);
router.get('/sales-by-variation', ReportsController.salesByVariation);
router.get('/expenses-report', ReportsController.expensesReport);
router.get('/invoices-report', ReportsController.invoicesReport);
router.get('/stock-report', ReportsController.stockReport);
router.get('/low-stock-report', ReportsController.lowStockReport);
router.get('/customer-summary', ReportsController.customerSummary);
router.get('/pdf/:reportKey', ReportsController.downloadReportPdf);

module.exports = router;