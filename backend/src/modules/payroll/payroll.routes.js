const express = require('express');
const PayrollController = require('./payroll.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware, permissionMiddleware(PERMISSIONS.PAYROLL_MANAGE));

router.get('/employees', PayrollController.getEmployees);

// Creating an employee can also create a brand-new login account
// (data.newLogin — see payroll.service.js#createEmployee), which is the
// same privilege as User Management's "Add User". PAYROLL_MANAGE alone
// (e.g. Accountant) is not enough here — stacking a second middleware
// means BOTH must pass, so this route effectively requires
// PAYROLL_MANAGE *and* USERS_MANAGE, which by default only ADMIN has.
// Everything else below (view, edit salary, generate, mark paid) stays
// reachable with PAYROLL_MANAGE alone.
router.post('/employees', permissionMiddleware(PERMISSIONS.USERS_MANAGE), PayrollController.createEmployee);

router.put('/employees/:id', PayrollController.updateEmployee);
router.get('/records', PayrollController.getRecords);
router.post('/records', PayrollController.generate);
router.patch('/records/:id/pay', PayrollController.markPaid);

module.exports = router;