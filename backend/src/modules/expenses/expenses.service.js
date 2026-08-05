const prisma = require('../../config/db');
const { getCurrentBusinessId } = require('../../config/db');

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Resolves a named/custom date-range filter into { gte, lte } bounds for
 * expense_date. Same boundary-helper approach as reports.service.js.
 * Supported presets: daily, weekly, monthly, six_monthly, yearly, custom
 * (requires startDate/endDate). No range (undefined/'all') = all time.
 */
function resolveDateRange({ range, startDate, endDate }) {
  const now = new Date();
  switch (range) {
    case 'daily':
      return { gte: startOfDay(now), lte: endOfDay(now) };
    case 'weekly': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { gte: startOfDay(start), lte: endOfDay(now) };
    }
    case 'monthly':
      return { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: endOfDay(now) };
    case 'six_monthly': {
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return { gte: start, lte: endOfDay(now) };
    }
    case 'yearly':
      return { gte: new Date(now.getFullYear(), 0, 1), lte: endOfDay(now) };
    case 'custom':
      if (!startDate || !endDate) {
        const err = new Error('Both startDate and endDate are required for a custom range.');
        err.status = 400;
        throw err;
      }
      return { gte: startOfDay(startDate), lte: endOfDay(endDate) };
    default:
      return undefined;
  }
}

class ExpensesService {
  /**
   * Get-or-create the single budget row — same intent as
   * getBusinessSettings() in utils/businessSettings.js, but implemented
   * as an atomic upsert rather than findUnique-then-create. The naive
   * two-step version has a race: if two requests both see "doesn't
   * exist yet" (e.g. two tabs loading at once, or React StrictMode's
   * double-invoked effects in dev) they both try to create it, and the
   * second create() throws a unique constraint error on id. upsert
   * compiles to a single atomic INSERT ... ON CONFLICT statement on
   * Postgres, so concurrent callers can't race each other here. The
   * catch is just a last-resort safety net for the theoretical case
   * where the upsert itself collides with another upsert mid-flight.
   */
  async getBudget() {
    const businessId = getCurrentBusinessId();
    try {
      return await prisma.expenseBudget.upsert({
        where: { business_id: businessId },
        update: {},
        create: {},
      });
    } catch (err) {
      if (err.code === 'P2002') {
        return prisma.expenseBudget.findUniqueOrThrow({ where: { business_id: businessId } });
      }
      throw err;
    }
  }

  async getBudgetSummary() {
    return this.budgetDTO(await this.getBudget());
  }

  /**
   * Manually set (top up or reduce) the total budget pool. The delta is
   * applied to current_balance rather than resetting it outright — a
   * top-up on a budget that's already been partly spent adds to what's
   * left, it doesn't wipe out spending that already happened. Every
   * change is logged to ExpenseBudgetAdjustment for a full audit trail.
   */
  async setBudget({ totalAmount, reason, adjustedBy }) {
    if (totalAmount === undefined || totalAmount === null || Number(totalAmount) < 0) {
      const err = new Error('A valid, non-negative budget amount is required.');
      err.status = 400;
      throw err;
    }
    const budget = await this.getBudget();
    const previousTotal = Number(budget.total_amount);
    const newTotal = Number(totalAmount);
    const delta = newTotal - previousTotal;
    const newBalance = Number(budget.current_balance) + delta;
    if (newBalance < 0) {
      const err = new Error(
        `Can't set the budget that low — staff have already been paid more than that from the pool. Lowest you can set it to right now is ${Number(budget.total_amount) - Number(budget.current_balance)}.`,
      );
      err.status = 400;
      throw err;
    }

    const [updated] = await prisma.$transaction([
      prisma.expenseBudget.update({
        where: { business_id: getCurrentBusinessId() },
        data: { total_amount: newTotal, current_balance: newBalance, updated_by: adjustedBy },
      }),
      prisma.expenseBudgetAdjustment.create({
        data: {
          budget_id: budget.id,
          previous_total: previousTotal,
          new_total: newTotal,
          difference: delta,
          reason: reason || null,
          adjusted_by: adjustedBy,
        },
      }),
    ]);
    return this.budgetDTO(updated);
  }

  /** Edits the org-wide fallback per-expense cap (used by any staff
   *  member who doesn't have their own StaffExpenseLimit row). */
  async setDefaultLimit({ defaultMaxPerExpense, updatedBy }) {
    if (defaultMaxPerExpense === undefined || Number(defaultMaxPerExpense) <= 0) {
      const err = new Error('A valid, positive default limit is required.');
      err.status = 400;
      throw err;
    }
    await this.getBudget();
    const updated = await prisma.expenseBudget.update({
      where: { business_id: getCurrentBusinessId() },
      data: { default_max_per_expense: Number(defaultMaxPerExpense), updated_by: updatedBy },
    });
    return this.budgetDTO(updated);
  }

  async getAdjustments() {
    const rows = await prisma.expenseBudgetAdjustment.findMany({ orderBy: { created_at: 'desc' } });
    return rows.map((a) => ({
      id: a.id,
      previousTotal: Number(a.previous_total),
      newTotal: Number(a.new_total),
      difference: Number(a.difference),
      reason: a.reason,
      adjustedBy: a.adjusted_by,
      createdAt: a.created_at,
    }));
  }

  // ---- Per-staff limits ----

  async getLimits() {
    const [employees, budget] = await Promise.all([
      prisma.employee.findMany({
        where: { is_active: true },
        include: { expense_limit: true },
        orderBy: { name: 'asc' },
      }),
      this.getBudget(),
    ]);
    const defaultLimit = Number(budget.default_max_per_expense);
    return employees.map((e) => ({
      employeeId: e.id,
      employeeName: e.name,
      roleTitle: e.role_title,
      maxAmount: e.expense_limit ? Number(e.expense_limit.max_amount) : defaultLimit,
      isCustom: !!e.expense_limit,
    }));
  }

  async setLimit({ employeeId, maxAmount, updatedBy }) {
    if (!employeeId) {
      const err = new Error('employeeId is required.');
      err.status = 400;
      throw err;
    }
    if (maxAmount === undefined || maxAmount === null || Number(maxAmount) <= 0) {
      const err = new Error('A valid, positive maximum amount is required.');
      err.status = 400;
      throw err;
    }
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      const err = new Error('Employee not found.');
      err.status = 404;
      throw err;
    }
    const limit = await prisma.staffExpenseLimit.upsert({
      where: { employee_id: employeeId },
      update: { max_amount: Number(maxAmount), updated_by: updatedBy },
      create: { employee_id: employeeId, max_amount: Number(maxAmount), updated_by: updatedBy },
    });
    return { employeeId, maxAmount: Number(limit.max_amount) };
  }

  /** Removes a custom override, reverting the employee back to the
   *  org-wide default. */
  async clearLimit(employeeId) {
    await prisma.staffExpenseLimit.deleteMany({ where: { employee_id: employeeId } });
    const budget = await this.getBudget();
    return { employeeId, maxAmount: Number(budget.default_max_per_expense) };
  }

  async getEffectiveLimit(employeeId) {
    const [limit, budget] = await Promise.all([
      prisma.staffExpenseLimit.findUnique({ where: { employee_id: employeeId } }),
      this.getBudget(),
    ]);
    return limit ? Number(limit.max_amount) : Number(budget.default_max_per_expense);
  }

  /**
   * Resolves the Employee record tied to a logged-in User. Every staff
   * member who can log in should have one (see Employee.user_id notes
   * in schema.prisma and the backfill script) — if somehow missing,
   * this fails clearly instead of letting someone record an expense
   * with no HR record behind it.
   */
  async getEmployeeForUser(userId) {
    const employee = await prisma.employee.findUnique({ where: { user_id: userId } });
    if (!employee) {
      const err = new Error('No employee record is linked to your account yet. Ask an admin to link one before recording expenses.');
      err.status = 400;
      throw err;
    }
    return employee;
  }

  async getMyEffectiveLimit(userId) {
    const employee = await this.getEmployeeForUser(userId);
    const maxAmount = await this.getEffectiveLimit(employee.id);
    return { employeeId: employee.id, maxAmount };
  }

  // ---- Recording expenses ----

  /**
   * Records a staff expense and deducts it from the shared budget pool,
   * atomically. Two independent caps are checked before anything is
   * written, in this order:
   *   1. That staff member's per-expense max (StaffExpenseLimit, falls
   *      back to the budget's default_max_per_expense) — rejected with
   *      "deduct less than X" if the amount is over.
   *   2. The remaining budget balance — can't deduct more than what's
   *      actually left in the pool, regardless of the personal limit.
   */
  async recordExpense({ employeeId, amount, category, description, expenseDate, createdBy }) {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      const err = new Error('Enter a valid expense amount greater than zero.');
      err.status = 400;
      throw err;
    }

    const [budget, maxAllowed] = await Promise.all([this.getBudget(), this.getEffectiveLimit(employeeId)]);

    if (numAmount > maxAllowed) {
      const err = new Error(`This is over your per-expense limit of ${maxAllowed}. Please deduct less than ${maxAllowed}, or ask an admin to raise your limit.`);
      err.status = 400;
      throw err;
    }

    const currentBalance = Number(budget.current_balance);
    if (numAmount > currentBalance) {
      const err = new Error(`Not enough left in the expense budget (${currentBalance} remaining). Please deduct a smaller amount.`);
      err.status = 400;
      throw err;
    }

    const newBalance = currentBalance - numAmount;

    const [expense] = await prisma.$transaction([
      prisma.staffExpense.create({
        data: {
          employee_id: employeeId,
          amount: numAmount,
          category: category || null,
          description: description || null,
          expense_date: expenseDate ? new Date(expenseDate) : new Date(),
          balance_after: newBalance,
          created_by: createdBy,
        },
        include: { employee: true },
      }),
      prisma.expenseBudget.update({ where: { business_id: getCurrentBusinessId() }, data: { current_balance: newBalance } }),
    ]);

    return this.expenseDTO(expense);
  }

  /** Staff record their own expense — employeeId always comes from the
   *  logged-in user's linked Employee record, never trusted from the
   *  request body. */
  async recordOwnExpense({ userId, amount, category, description, expenseDate }) {
    const employee = await this.getEmployeeForUser(userId);
    return this.recordExpense({
      employeeId: employee.id,
      amount,
      category,
      description,
      expenseDate,
      createdBy: userId,
    });
  }

  /**
   * Reverses an expense — refunds the amount back to the budget and
   * marks it VOIDED — instead of deleting the row. Same pattern the app
   * already uses for invoices (VOID) and stock movements
   * (VOID_REVERSAL), so history/audit trail stays intact.
   */
  async voidExpense({ expenseId, voidedBy, reason }) {
    const expense = await prisma.staffExpense.findUnique({ where: { id: expenseId } });
    if (!expense) {
      const err = new Error('Expense not found.');
      err.status = 404;
      throw err;
    }
    if (expense.status === 'VOIDED') {
      const err = new Error('This expense is already voided.');
      err.status = 409;
      throw err;
    }
    const budget = await this.getBudget();
    const newBalance = Number(budget.current_balance) + Number(expense.amount);

    const [updated] = await prisma.$transaction([
      prisma.staffExpense.update({
        where: { id: expenseId },
        data: { status: 'VOIDED', voided_at: new Date(), voided_by: voidedBy, void_reason: reason || null },
        include: { employee: true },
      }),
      prisma.expenseBudget.update({ where: { business_id: getCurrentBusinessId() }, data: { current_balance: newBalance } }),
    ]);
    return this.expenseDTO(updated);
  }

  // ---- History ----

  /**
   * Full history with filters. `employeeId` scopes to one staff member
   * (admins drilling into someone specific, or a staff member's own
   * history — see getOwnHistory below). `range` is one of the presets
   * resolveDateRange understands ('daily' | 'weekly' | 'monthly' |
   * 'six_monthly' | 'yearly' | 'custom'), or omitted for all time.
   */
  async getHistory({ employeeId, range, startDate, endDate, category, includeVoided }) {
    const dateFilter = resolveDateRange({ range, startDate, endDate });
    const where = {
      ...(employeeId && { employee_id: employeeId }),
      ...(dateFilter && { expense_date: dateFilter }),
      ...(category && { category }),
      ...(!includeVoided && { status: 'RECORDED' }),
    };
    const expenses = await prisma.staffExpense.findMany({
      where,
      include: { employee: true },
      orderBy: { expense_date: 'desc' },
    });
    const activeOnly = expenses.filter((e) => e.status === 'RECORDED');
    return {
      expenses: expenses.map(this.expenseDTO),
      summary: {
        count: activeOnly.length,
        totalSpent: activeOnly.reduce((sum, e) => sum + Number(e.amount), 0),
      },
    };
  }

  async getOwnHistory({ userId, ...filters }) {
    const employee = await this.getEmployeeForUser(userId);
    return this.getHistory({ ...filters, employeeId: employee.id });
  }

  // ---- DTOs ----

  budgetDTO(budget) {
    return {
      totalAmount: Number(budget.total_amount),
      currentBalance: Number(budget.current_balance),
      spent: Number(budget.total_amount) - Number(budget.current_balance),
      defaultMaxPerExpense: Number(budget.default_max_per_expense),
      updatedAt: budget.updated_at,
      updatedBy: budget.updated_by,
    };
  }

  expenseDTO(expense) {
    return {
      id: expense.id,
      employeeId: expense.employee_id,
      employeeName: expense.employee?.name,
      amount: Number(expense.amount),
      category: expense.category,
      description: expense.description,
      expenseDate: expense.expense_date,
      balanceAfter: Number(expense.balance_after),
      status: expense.status,
      voidedAt: expense.voided_at,
      voidReason: expense.void_reason,
      createdAt: expense.created_at,
    };
  }
}

module.exports = new ExpensesService();