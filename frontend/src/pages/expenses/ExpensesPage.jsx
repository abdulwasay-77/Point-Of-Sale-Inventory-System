
import { useState, useEffect, useCallback } from 'react'
import PageHeader from '../../components/common/PageHeader'
import Modal from '../../components/common/Modal'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import Badge from '../../components/common/Badge'
import StatCard from '../../components/dashboard/StatCard'
import { useDisclosure } from '../../hooks/useDisclosure'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { expenseService } from '../../services/expenseService'
import { payrollService } from '../../services/payrollService'
import { formatCurrency, formatDateTime } from '../../utils/formatters'

const CATEGORIES = ['Meals', 'Travel', 'Office Supplies', 'Client Entertainment', 'Miscellaneous']

const RANGE_OPTIONS = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'six_monthly', label: 'Last 6 Months' },
  { value: 'yearly', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
  { value: 'all', label: 'All Time' },
]

/**
 * Staff Expense Management — independent from Payroll (see CHANGES.md).
 * Staff log discretionary spend (e.g. "lunch, Rs 400") against a shared,
 * admin-set budget pool; each entry is checked against both that
 * person's per-expense limit and the pool's remaining balance before
 * it's deducted (see expenses.service.js#recordExpense).
 *
 * Tabs:
 *  - Record (EXPENSES_RECORD *and* the user has a linked Employee row) —
 *    log an expense, see your own limit.
 *  - My History (same condition as Record) — your own spend, with
 *    date-range filters.
 *  - Budget & Limits (EXPENSES_MANAGE only) — set the pool total, the
 *    default per-expense cap, and per-employee overrides.
 *  - All Staff History (EXPENSES_MANAGE only) — every staff member's
 *    spend, filterable, with a Void action for corrections.
 *
 * Record/My History need an actual Employee record behind the logged-in
 * User (see Employee.user_id in schema.prisma) — that's who the expense
 * gets attributed to and whose per-expense limit is checked. Admins are
 * not necessarily Employees (they're not on payroll), so an admin with
 * no linked Employee row only gets the two management tabs; recording
 * on their behalf isn't offered since there's no employee to attribute
 * it to.
 */
export default function ExpensesPage() {
  const { user } = useAuth()
  const { has } = usePermissions()
  const canManage = has('EXPENSES_MANAGE')
  const canRecordOwn = has('EXPENSES_RECORD') && Boolean(user?.employeeId)

  const [tab, setTab] = useState(() => (canRecordOwn ? 'record' : canManage ? 'budget' : 'my-history'))

  return (
    <div data-keyboard-scope>
      <PageHeader
        title="Staff Expenses"
        subtitle="Log day-to-day staff spend against the shared expense budget, and keep a clean history of every deduction."
      />

      <div className="flex gap-1 mb-5 flex-wrap">
        {canRecordOwn && (
          <>
            <TabButton active={tab === 'record'} onClick={() => setTab('record')}>
              Record Expense
            </TabButton>
            <TabButton active={tab === 'my-history'} onClick={() => setTab('my-history')}>
              My History
            </TabButton>
          </>
        )}
        {canManage && (
          <>
            <TabButton active={tab === 'budget'} onClick={() => setTab('budget')}>
              Budget & Limits
            </TabButton>
            <TabButton active={tab === 'all-history'} onClick={() => setTab('all-history')}>
              All Staff History
            </TabButton>
          </>
        )}
      </div>

      {tab === 'record' && canRecordOwn && <RecordExpenseTab />}
      {tab === 'my-history' && canRecordOwn && <HistoryTable scope="mine" />}
      {tab === 'budget' && canManage && <BudgetLimitsTab />}
      {tab === 'all-history' && canManage && <HistoryTable scope="all" />}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-amber text-ink dark:text-dark-text' : 'text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2'
      }`}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Record Expense                                                      */
/* ------------------------------------------------------------------ */

function RecordExpenseTab() {
  const [myLimit, setMyLimit] = useState(null)
  const [isLoadingLimit, setIsLoadingLimit] = useState(true)

  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const loadLimit = useCallback(async () => {
    setIsLoadingLimit(true)
    try {
      const res = await expenseService.getMyLimit()
      setMyLimit(res.data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your expense limit.')
    } finally {
      setIsLoadingLimit(false)
    }
  }, [])

  useEffect(() => {
    loadLimit()
  }, [loadLimit])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!amount || Number(amount) <= 0) {
      setError('Enter a valid amount greater than zero.')
      return
    }
    setIsSaving(true)
    try {
      const res = await expenseService.recordMine({ amount, category, description, expenseDate })
      setSuccess(`Recorded ${formatCurrency(res.data.data.amount)} — budget balance is now ${formatCurrency(res.data.data.balanceAfter)}.`)
      setAmount('')
      setDescription('')
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
      <div className="lg:col-span-1">
        {isLoadingLimit ? (
          <Loading message="Loading your limit…" />
        ) : (
          <StatCard label="Your Per-Expense Limit" value={myLimit ? formatCurrency(myLimit.maxAmount) : '—'} icon="creditCard" tone="amber" />
        )}
        <p className="text-xs text-ink-muted dark:text-dark-muted mt-3 px-1">
          You can log any single expense up to this amount, as long as the shared budget pool has enough left in it. If you need a higher limit, ask an admin.
        </p>
      </div>

      <div className="lg:col-span-2 card card-premium shine-sweep glow-amber p-5 sm:p-6">
        <h3 className="font-display text-base font-semibold text-ink dark:text-dark-text mb-4">Log a New Expense</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text" htmlFor="exp-amount">
                Amount
              </label>
              <input
                id="exp-amount"
                type="number"
                min="0"
                step="0.01"
                className="input-field figure"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="label-text" htmlFor="exp-category">
                Category
              </label>
              <select id="exp-category" className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label-text" htmlFor="exp-date">
              Date
            </label>
            <input id="exp-date" type="date" className="input-field" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </div>

          <div>
            <label className="label-text" htmlFor="exp-desc">
              Note <span className="text-ink-muted dark:text-dark-muted font-normal">(optional)</span>
            </label>
            <input
              id="exp-desc"
              className="input-field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Team lunch with supplier"
            />
          </div>

          {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-sm text-teal dark:text-dark-teal bg-teal/10 dark:bg-dark-teal/15 rounded-lg px-3 py-2">{success}</p>}

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isSaving} className="btn-accent disabled:opacity-60">
              {isSaving ? 'Recording…' : 'Record Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Budget & Limits (EXPENSES_MANAGE)                                   */
/* ------------------------------------------------------------------ */

function BudgetLimitsTab() {
  const [budget, setBudget] = useState(null)
  const [limits, setLimits] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const budgetModal = useDisclosure()
  const limitModal = useDisclosure()
  const [activeLimit, setActiveLimit] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [budgetRes, limitsRes] = await Promise.all([expenseService.getBudget(), expenseService.getLimits()])
      setBudget(budgetRes.data.data)
      setLimits(limitsRes.data.data)
    } catch {
      setError('Could not load the budget and limits.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleClearLimit(employeeId) {
    try {
      await expenseService.clearLimit(employeeId)
      await load()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    }
  }

  if (isLoading) return <Loading message="Loading budget…" />

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Budget Total" value={formatCurrency(budget.totalAmount)} icon="creditCard" tone="ink" />
        <StatCard label="Remaining Balance" value={formatCurrency(budget.currentBalance)} icon="chart" tone="teal" highlight />
        <StatCard label="Spent So Far" value={formatCurrency(budget.spent)} icon="reports" tone="rose" />
        <StatCard label="Default Per-Expense Limit" value={formatCurrency(budget.defaultMaxPerExpense)} icon="settings" tone="amber" />
      </div>

      <div className="card card-premium p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-ink dark:text-dark-text">Budget Pool</h3>
          <p className="text-sm text-ink-muted dark:text-dark-muted mt-1">
            Set manually by an admin. Top-ups add to what&apos;s left; reducing it can&apos;t go below what&apos;s already been spent.
          </p>
        </div>
        <button type="button" className="btn-accent shrink-0" onClick={budgetModal.open}>
          Edit Budget
        </button>
      </div>

      <div className="card card-premium">
        <div className="p-5 sm:p-6 border-b border-line dark:border-dark-border">
          <h3 className="font-display text-base font-semibold text-ink dark:text-dark-text">Per-Staff Limits</h3>
          <p className="text-sm text-ink-muted dark:text-dark-muted mt-1">
            The maximum a single expense from that person can be. Anyone without a custom limit uses the default above.
          </p>
        </div>
        {limits.length === 0 ? (
          <EmptyState title="No active employees" description="Add employees in Payroll first." icon="👥" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th className="text-right">Limit</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {limits.map((l) => (
                  <tr key={l.employeeId}>
                    <td className="font-medium text-ink dark:text-dark-text">{l.employeeName}</td>
                    <td className="text-ink-muted dark:text-dark-muted">{l.roleTitle || '—'}</td>
                    <td className="text-right figure">
                      {formatCurrency(l.maxAmount)}{' '}
                      {l.isCustom ? <Badge tone="amber">Custom</Badge> : <Badge tone="teal">Default</Badge>}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-amber hover:underline"
                          onClick={() => {
                            setActiveLimit(l)
                            limitModal.open()
                          }}
                        >
                          Edit
                        </button>
                        {l.isCustom && (
                          <button type="button" className="text-xs font-medium text-rose dark:text-dark-rose hover:underline" onClick={() => handleClearLimit(l.employeeId)}>
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BudgetEditModal isOpen={budgetModal.isOpen} onClose={budgetModal.close} budget={budget} onSaved={load} />
      <LimitEditModal
        isOpen={limitModal.isOpen}
        onClose={() => {
          limitModal.close()
          setActiveLimit(null)
        }}
        limit={activeLimit}
        onSaved={load}
      />
    </div>
  )
}

function BudgetEditModal({ isOpen, onClose, budget, onSaved }) {
  const [totalAmount, setTotalAmount] = useState('')
  const [reason, setReason] = useState('')
  const [defaultMaxPerExpense, setDefaultMaxPerExpense] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen && budget) {
      setTotalAmount(String(budget.totalAmount))
      setDefaultMaxPerExpense(String(budget.defaultMaxPerExpense))
      setReason('')
      setError('')
    }
  }, [isOpen, budget])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setIsSaving(true)
    try {
      if (Number(totalAmount) !== budget.totalAmount) {
        await expenseService.setBudget({ totalAmount, reason })
      }
      if (Number(defaultMaxPerExpense) !== budget.defaultMaxPerExpense) {
        await expenseService.setDefaultLimit({ defaultMaxPerExpense })
      }
      await onSaved()
      onClose()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Expense Budget" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-text" htmlFor="budget-total">
            Total budget amount
          </label>
          <input
            id="budget-total"
            type="number"
            min="0"
            step="0.01"
            className="input-field figure"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label-text" htmlFor="budget-reason">
            Reason for change <span className="text-ink-muted dark:text-dark-muted font-normal">(optional)</span>
          </label>
          <input id="budget-reason" className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Monthly top-up" />
        </div>
        <div>
          <label className="label-text" htmlFor="budget-default-limit">
            Default per-expense limit
          </label>
          <input
            id="budget-default-limit"
            type="number"
            min="0"
            step="0.01"
            className="input-field figure"
            value={defaultMaxPerExpense}
            onChange={(e) => setDefaultMaxPerExpense(e.target.value)}
          />
          <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">Applies to any staff member without a custom limit.</p>
        </div>

        {error && <p className="text-xs text-rose dark:text-dark-rose">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="btn-accent disabled:opacity-60">
            {isSaving ? 'Saving…' : 'Save Budget'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function LimitEditModal({ isOpen, onClose, limit, onSaved }) {
  const [maxAmount, setMaxAmount] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen && limit) {
      setMaxAmount(String(limit.maxAmount))
      setError('')
    }
  }, [isOpen, limit])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!maxAmount || Number(maxAmount) <= 0) {
      setError('Enter a valid, positive amount.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await expenseService.setLimit({ employeeId: limit.employeeId, maxAmount })
      await onSaved()
      onClose()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  if (!limit) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Set Limit — ${limit.employeeName}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-text" htmlFor="limit-amount">
            Maximum per expense
          </label>
          <input
            id="limit-amount"
            type="number"
            min="0"
            step="0.01"
            className="input-field figure"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
          />
        </div>
        {error && <p className="text-xs text-rose dark:text-dark-rose">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="btn-accent disabled:opacity-60">
            {isSaving ? 'Saving…' : 'Save Limit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* History (shared by "My History" and "All Staff History")            */
/* ------------------------------------------------------------------ */

function HistoryTable({ scope }) {
  const canManage = usePermissions().has('EXPENSES_MANAGE')
  const [range, setRange] = useState('monthly')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [employees, setEmployees] = useState([])
  const [data, setData] = useState({ expenses: [], summary: { count: 0, totalSpent: 0 } })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [voidReason, setVoidReason] = useState('')
  const [voidTarget, setVoidTarget] = useState(null)
  const voidModal = useDisclosure()

  useEffect(() => {
    if (scope === 'all') {
      payrollService
        .getEmployees()
        .then((res) => setEmployees(res.data.data))
        .catch(() => {})
    }
  }, [scope])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const params = { range: range === 'all' ? undefined : range }
      if (range === 'custom') {
        params.startDate = startDate
        params.endDate = endDate
      }
      if (scope === 'all' && employeeFilter) params.employeeId = employeeFilter

      const res = scope === 'mine' ? await expenseService.getMyHistory(params) : await expenseService.getAllHistory(params)
      setData(res.data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load expense history.')
    } finally {
      setIsLoading(false)
    }
  }, [scope, range, startDate, endDate, employeeFilter])

  useEffect(() => {
    if (range !== 'custom' || (startDate && endDate)) load()
  }, [load, range, startDate, endDate])

  async function handleVoid(e) {
    e.preventDefault()
    try {
      await expenseService.voidExpense(voidTarget.id, voidReason)
      voidModal.close()
      setVoidTarget(null)
      setVoidReason('')
      await load()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    }
  }

  return (
    <div className="space-y-4">
      <div className="card card-premium p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label-text" htmlFor="hist-range">
            Period
          </label>
          <select id="hist-range" className="input-field" value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {range === 'custom' && (
          <>
            <div>
              <label className="label-text" htmlFor="hist-start">
                From
              </label>
              <input id="hist-start" type="date" className="input-field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label-text" htmlFor="hist-end">
                To
              </label>
              <input id="hist-end" type="date" className="input-field" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </>
        )}
        {scope === 'all' && (
          <div>
            <label className="label-text" htmlFor="hist-employee">
              Employee
            </label>
            <select id="hist-employee" className="input-field" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
              <option value="">All employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Expenses in Range" value={data.summary.count} icon="reports" tone="ink" />
        <StatCard label="Total Spent" value={formatCurrency(data.summary.totalSpent)} icon="creditCard" tone="amber" highlight />
      </div>

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2">{error}</p>}

      <div className="card card-premium">
        {isLoading ? (
          <Loading message="Loading history…" />
        ) : data.expenses.length === 0 ? (
          <EmptyState title="No expenses in this range" description="Try a wider date range, or record a new expense." icon="🧾" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Date</th>
                  {scope === 'all' && <th>Employee</th>}
                  <th>Category</th>
                  <th>Note</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Balance After</th>
                  <th>Status</th>
                  {canManage && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((exp) => (
                  <tr key={exp.id} className={exp.status === 'VOIDED' ? 'opacity-60' : ''}>
                    <td className="text-ink-muted dark:text-dark-muted">{formatDateTime(exp.expenseDate)}</td>
                    {scope === 'all' && <td className="font-medium text-ink dark:text-dark-text">{exp.employeeName}</td>}
                    <td>{exp.category || '—'}</td>
                    <td className="text-ink-muted dark:text-dark-muted max-w-xs truncate">{exp.description || '—'}</td>
                    <td className="text-right figure">{formatCurrency(exp.amount)}</td>
                    <td className="text-right figure text-ink-muted dark:text-dark-muted">{formatCurrency(exp.balanceAfter)}</td>
                    <td>
                      {exp.status === 'VOIDED' ? <Badge tone="rose">Voided</Badge> : <Badge tone="teal">Recorded</Badge>}
                    </td>
                    {canManage && (
                      <td className="text-right">
                        {exp.status === 'RECORDED' && (
                          <button
                            type="button"
                            className="text-xs font-medium text-rose dark:text-dark-rose hover:underline"
                            onClick={() => {
                              setVoidTarget(exp)
                              voidModal.open()
                            }}
                          >
                            Void
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={voidModal.isOpen} onClose={voidModal.close} title="Void Expense" size="sm">
        <form onSubmit={handleVoid} className="space-y-4">
          {voidTarget && (
            <p className="text-sm text-ink-muted dark:text-dark-muted bg-paper-dim dark:bg-dark-card2 rounded-lg px-3 py-2">
              This refunds <span className="font-semibold text-ink dark:text-dark-text">{formatCurrency(voidTarget.amount)}</span> back to the budget and marks the entry
              voided — it stays in the history, it isn&apos;t deleted.
            </p>
          )}
          <div>
            <label className="label-text" htmlFor="void-reason">
              Reason <span className="text-ink-muted dark:text-dark-muted font-normal">(optional)</span>
            </label>
            <input id="void-reason" className="input-field" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Entered twice by mistake" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-outline" onClick={voidModal.close}>
              Cancel
            </button>
            <button type="submit" className="btn-accent">
              Void & Refund
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}


