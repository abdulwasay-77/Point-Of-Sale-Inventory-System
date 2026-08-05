const ExpensesService = require('./expenses.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class ExpensesController {
  // ---- Budget (EXPENSES_MANAGE) ----

  getBudget = asyncHandler(async (req, res) => {
    success(res, await ExpensesService.getBudgetSummary());
  });

  setBudget = asyncHandler(async (req, res) => {
    const { totalAmount, reason } = req.body;
    const budget = await ExpensesService.setBudget({ totalAmount, reason, adjustedBy: req.user.userId });
    success(res, budget, 'Budget updated');
  });

  setDefaultLimit = asyncHandler(async (req, res) => {
    const { defaultMaxPerExpense } = req.body;
    const budget = await ExpensesService.setDefaultLimit({ defaultMaxPerExpense, updatedBy: req.user.userId });
    success(res, budget, 'Default per-expense limit updated');
  });

  getAdjustments = asyncHandler(async (req, res) => {
    success(res, await ExpensesService.getAdjustments());
  });

  // ---- Per-staff limits (EXPENSES_MANAGE) ----

  getLimits = asyncHandler(async (req, res) => {
    success(res, await ExpensesService.getLimits());
  });

  setLimit = asyncHandler(async (req, res) => {
    const { employeeId, maxAmount } = req.body;
    const limit = await ExpensesService.setLimit({ employeeId, maxAmount, updatedBy: req.user.userId });
    success(res, limit, 'Limit updated');
  });

  clearLimit = asyncHandler(async (req, res) => {
    const limit = await ExpensesService.clearLimit(req.params.employeeId);
    success(res, limit, 'Reverted to default limit');
  });

  // ---- Recording ----

  // EXPENSES_RECORD — every staff member logging their own spend.
  recordOwnExpense = asyncHandler(async (req, res) => {
    const { amount, category, description, expenseDate } = req.body;
    const expense = await ExpensesService.recordOwnExpense({ userId: req.user.userId, amount, category, description, expenseDate });
    created(res, expense, 'Expense recorded');
  });

  getMyLimit = asyncHandler(async (req, res) => {
    success(res, await ExpensesService.getMyEffectiveLimit(req.user.userId));
  });

  getMyHistory = asyncHandler(async (req, res) => {
    const { range, startDate, endDate, category } = req.query;
    success(res, await ExpensesService.getOwnHistory({ userId: req.user.userId, range, startDate, endDate, category }));
  });

  // EXPENSES_MANAGE — admin recording an expense on behalf of a staff member.
  recordForEmployee = asyncHandler(async (req, res) => {
    const { employeeId, amount, category, description, expenseDate } = req.body;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'employeeId is required' });
    }
    const expense = await ExpensesService.recordExpense({
      employeeId,
      amount,
      category,
      description,
      expenseDate,
      createdBy: req.user.userId,
    });
    created(res, expense, 'Expense recorded');
  });

  voidExpense = asyncHandler(async (req, res) => {
    const expense = await ExpensesService.voidExpense({ expenseId: req.params.id, voidedBy: req.user.userId, reason: req.body.reason });
    success(res, expense, 'Expense voided and refunded to the budget');
  });

  getAllHistory = asyncHandler(async (req, res) => {
    const { employeeId, range, startDate, endDate, category, includeVoided } = req.query;
    const history = await ExpensesService.getHistory({
      employeeId,
      range,
      startDate,
      endDate,
      category,
      includeVoided: includeVoided === 'true',
    });
    success(res, history);
  });
}

module.exports = new ExpensesController();