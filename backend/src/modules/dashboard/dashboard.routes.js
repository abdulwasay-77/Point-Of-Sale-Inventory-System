
const express = require('express');
const DashboardController = require('./dashboard.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware, permissionMiddleware(PERMISSIONS.DASHBOARD_VIEW));
router.get('/summary', DashboardController.getSummary);

module.exports = router;
