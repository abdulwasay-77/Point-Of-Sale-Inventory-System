const express = require('express');
const ExpensesController = require('./expenses.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

// ---- Everyone with EXPENSES_RECORD: log + view their own spend ----
router.post('/mine', permissionMiddleware(PERMISSIONS.EXPENSES_RECORD), ExpensesController.recordOwnExpense);
router.get('/mine/limit', permissionMiddleware(PERMISSIONS.EXPENSES_RECORD), ExpensesController.getMyLimit);
router.get('/mine/history', permissionMiddleware(PERMISSIONS.EXPENSES_RECORD), ExpensesController.getMyHistory);

// ---- EXPENSES_MANAGE (Admin / Accountant by default): budget pool ----
router.get('/budget', permissionMiddleware(PERMISSIONS.EXPENSES_MANAGE), ExpensesController.getBudget);
router.put('/budget', permissionMiddleware(PERMISSIONS.EXPENSES_MANAGE), ExpensesController.setBudget);
router.put('/budget/default-limit', permissionMiddleware(PERMISSIONS.EXPENSES_MANAGE), ExpensesController.setDefaultLimit);
router.get('/budget/adjustments', permissionMiddleware(PERMISSIONS.EXPENSES_MANAGE), ExpensesController.getAdjustments);

// ---- EXPENSES_MANAGE: per-staff limits ----
router.get('/limits', permissionMiddleware(PERMISSIONS.EXPENSES_MANAGE), ExpensesController.getLimits);
router.put('/limits', permissionMiddleware(PERMISSIONS.EXPENSES_MANAGE), ExpensesController.setLimit);
router.delete('/limits/:employeeId', permissionMiddleware(PERMISSIONS.EXPENSES_MANAGE), ExpensesController.clearLimit);

// ---- EXPENSES_MANAGE: record on behalf of / void / full history ----
router.post('/', permissionMiddleware(PERMISSIONS.EXPENSES_MANAGE), ExpensesController.recordForEmployee);
router.patch('/:id/void', permissionMiddleware(PERMISSIONS.EXPENSES_MANAGE), ExpensesController.voidExpense);
router.get('/history', permissionMiddleware(PERMISSIONS.EXPENSES_MANAGE), ExpensesController.getAllHistory);

module.exports = router;