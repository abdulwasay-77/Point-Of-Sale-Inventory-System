
const express = require('express');
const PayrollController = require('./payroll.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware, permissionMiddleware(PERMISSIONS.PAYROLL_MANAGE));

router.get('/employees', PayrollController.getEmployees);
router.get('/records', PayrollController.getRecords);
router.post('/records', PayrollController.generate);
router.patch('/records/:id/pay', PayrollController.markPaid);

module.exports = router;
