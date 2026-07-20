
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

module.exports = router;
