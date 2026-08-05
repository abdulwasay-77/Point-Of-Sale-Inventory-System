
import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import SearchInput from '../../components/common/SearchInput'
import Modal from '../../components/common/Modal'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import Badge from '../../components/common/Badge'
import Icon from '../../components/common/Icon'
import StatCard from '../../components/dashboard/StatCard'
import { useDisclosure } from '../../hooks/useDisclosure'
import { usePermissions } from '../../hooks/usePermissions'
import { payrollService } from '../../services/payrollService'
import { userService } from '../../services/userService'
import { rolesService } from '../../services/rolesService'
import { formatCurrency, formatDate } from '../../utils/formatters'

const AVATAR_TONES = [
  'bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal',
  'bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber',
  'bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose',
  'bg-ink text-paper dark:bg-dark-border dark:text-dark-text',
]

function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

function toneFor(id) {
  const n = typeof id === 'number' ? id : String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_TONES[n % AVATAR_TONES.length]
}

/**
 * Payroll — HR records (Employee) + generated pay runs (PayrollRecord).
 * Backend has been live for a while (payroll.controller/service/routes);
 * this page is the missing GUI on top of it, gated by PAYROLL_MANAGE like
 * every other admin-ish module (see Sidebar.jsx / permissions.js).
 *
 * Two tabs, same "list + modal" shape as Suppliers/Credit:
 *  - Employees: the HR roster — create/edit + a shortcut into Run Payroll.
 *  - Payroll Records: every generated pay run, filterable by employee,
 *    with a Mark Paid action for anything still PENDING.
 *
 * Deliberately NOT editable here: an employee's name/contact/address.
 * payroll.service.js#updateEmployee only accepts role_title, base_salary,
 * commission_rate and is_active — those three-plus-status fields are the
 * only thing an admin manages from this screen. Contact details are only
 * editable through the Profile module, and only once an employee is
 * linked to a login account (see profile.service.js), so the Edit modal
 * shows name/contact/address read-only with a short note explaining why.
 */
export default function PayrollPage() {
  const { has } = usePermissions()
  // Adding an employee can create a brand-new login account, which is
  // the same privilege as User Management's "Add User" — so this button
  // (and its server-side route) requires USERS_MANAGE, not just
  // PAYROLL_MANAGE. An Accountant has PAYROLL_MANAGE but not
  // USERS_MANAGE by default, so this simply disappears for them.
  const canAddEmployee = has('USERS_MANAGE')

  const [tab, setTab] = useState('employees') // 'employees' | 'records'

  const [employees, setEmployees] = useState([])
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true)
  const [records, setRecords] = useState([])
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)
  const [recordsLoaded, setRecordsLoaded] = useState(false)
  const [recordsFilter, setRecordsFilter] = useState('') // employeeId, '' = all

  // Users list is only used to optionally link a new Employee to an
  // existing login account. GET /users requires USERS_MANAGE, which an
  // Accountant (the other role that gets PAYROLL_MANAGE by default) won't
  // necessarily have — so this is fetched best-effort and the "link to a
  // user account" field simply doesn't appear if it fails.
  const [users, setUsers] = useState([])
  // Same best-effort pattern as `users` above — the "Base role" select in
  // the new-login form is empty (rather than broken) if this fails.
  const [roles, setRoles] = useState([])

  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  const [activeEmployee, setActiveEmployee] = useState(null)
  const [generateFor, setGenerateFor] = useState(null)

  const formModal = useDisclosure()
  const generateModal = useDisclosure()

  async function loadEmployees() {
    setIsLoadingEmployees(true)
    try {
      const res = await payrollService.getEmployees()
      setEmployees(res.data.data)
    } catch {
      setError('Could not load employees.')
    } finally {
      setIsLoadingEmployees(false)
    }
  }

  async function loadRecords(employeeId = recordsFilter) {
    setIsLoadingRecords(true)
    try {
      const res = await payrollService.getRecords(employeeId || undefined)
      setRecords(res.data.data)
      setRecordsLoaded(true)
    } catch {
      setError('Could not load payroll records.')
    } finally {
      setIsLoadingRecords(false)
    }
  }

  useEffect(() => {
    loadEmployees()
    userService
      .getAll()
      .then((res) => setUsers(res.data.data))
      .catch(() => setUsers([]))
    rolesService
      .getAll()
      .then((res) => setRoles(res.data.data))
      .catch(() => setRoles([]))
  }, [])

  useEffect(() => {
    if (tab === 'records' && !recordsLoaded) loadRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const filteredEmployees = useMemo(
    () => employees.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())),
    [employees, query],
  )

  const filteredRecords = useMemo(
    () => records.filter((r) => (r.employeeName || '').toLowerCase().includes(query.toLowerCase())),
    [records, query],
  )

  const employeeStats = useMemo(() => {
    const active = employees.filter((e) => e.isActive)
    const totalBase = active.reduce((sum, e) => sum + e.baseSalary, 0)
    const onCommission = employees.filter((e) => e.commissionRate).length
    return { total: employees.length, active: active.length, totalBase, onCommission }
  }, [employees])

  const recordStats = useMemo(() => {
    const pending = records.filter((r) => r.paidStatus === 'PENDING')
    const paid = records.filter((r) => r.paidStatus === 'PAID')
    const totalPayable = pending.reduce((sum, r) => sum + r.totalPayable, 0)
    return { total: records.length, pendingCount: pending.length, paidCount: paid.length, totalPayable }
  }, [records])

  function openCreate() {
    setActiveEmployee(null)
    formModal.open()
  }

  function openEdit(employee) {
    setActiveEmployee(employee)
    formModal.open()
  }

  function openGenerate(employee = null) {
    setGenerateFor(employee)
    generateModal.open()
  }

  async function handleSaveEmployee(values) {
    try {
      if (activeEmployee) {
        await payrollService.updateEmployee(activeEmployee.id, values)
      } else {
        await payrollService.createEmployee(values)
      }
      formModal.close()
      await loadEmployees()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    }
  }

  async function handleGenerated() {
    generateModal.close()
    setTab('records')
    await loadRecords(recordsFilter)
  }

  async function handleMarkPaid(record) {
    try {
      await payrollService.markPaid(record.id)
      await loadRecords(recordsFilter)
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    }
  }

  function handleFilterChange(employeeId) {
    setRecordsFilter(employeeId)
    loadRecords(employeeId)
  }

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Employee HR records, base salary + commission, and generated pay runs."
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-outline transition-all duration-200 hover:-translate-y-0.5"
              onClick={() => openGenerate(null)}
            >
              <Icon name="reports" className="h-4 w-4" />
              Run Payroll
            </button>
            {canAddEmployee && (
              <button
                type="button"
                className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
                onClick={openCreate}
              >
                <Icon name="plus" className="h-4 w-4" />
                Add Employee
              </button>
            )}
          </div>
        }
      />

      {error && (
        <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {tab === 'employees' && !isLoadingEmployees && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Employees" value={employeeStats.total} icon="users" tone="ink" />
          <StatCard label="Active" value={employeeStats.active} icon="checkCircle" tone="teal" />
          <StatCard label="Monthly Base Payroll" value={formatCurrency(employeeStats.totalBase)} icon="creditCard" tone="amber" highlight />
          <StatCard label="On Commission" value={employeeStats.onCommission} icon="chart" tone="rose" />
        </div>
      )}

      {tab === 'records' && !isLoadingRecords && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Records" value={recordStats.total} icon="reports" tone="ink" />
          <StatCard label="Pending" value={recordStats.pendingCount} icon="calendar" tone="rose" />
          <StatCard label="Paid" value={recordStats.paidCount} icon="checkCircle" tone="teal" />
          <StatCard label="Pending Payable" value={formatCurrency(recordStats.totalPayable)} icon="creditCard" tone="amber" highlight />
        </div>
      )}

      <div className="card card-premium shine-sweep glow-amber">
        <div className="flex items-center justify-between gap-4 p-4 border-b border-line dark:border-dark-border flex-wrap">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab('employees')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'employees' ? 'bg-amber text-white' : 'text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2'
              }`}
            >
              Employees
            </button>
            <button
              type="button"
              onClick={() => setTab('records')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'records' ? 'bg-amber text-white' : 'text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2'
              }`}
            >
              Payroll Records
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {tab === 'records' && (
              <select
                className="input-field w-auto"
                value={recordsFilter}
                onChange={(e) => handleFilterChange(e.target.value)}
              >
                <option value="">All Employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            )}
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={tab === 'employees' ? 'Search employees…' : 'Search by employee…'}
              className="max-w-xs"
            />
          </div>
        </div>

        {tab === 'employees' ? (
          isLoadingEmployees ? (
            <Loading message="Loading employees…" />
          ) : filteredEmployees.length === 0 ? (
            <EmptyState
              title="No employees found"
              description={
                canAddEmployee
                  ? 'Try a different search, or add your first employee.'
                  : 'Try a different search. Adding employees is restricted to Admin.'
              }
              actionLabel={canAddEmployee ? 'Add Employee' : undefined}
              onAction={canAddEmployee ? openCreate : undefined}
              icon="🧑‍💼"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base table-premium">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Contact</th>
                    <th className="text-right">Base Salary</th>
                    <th className="text-right">Commission</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="group">
                      <td>
                        <div className="flex items-center gap-3">
                          <span className={`section-icon rounded-lg font-semibold text-xs ${toneFor(emp.id)}`}>
                            {initialsOf(emp.name)}
                          </span>
                          <div>
                            <span className="font-medium block">{emp.name}</span>
                            <span className="text-xs text-ink-muted dark:text-dark-muted">
                              Hired {formatDate(emp.hireDate)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="text-ink-muted dark:text-dark-muted">{emp.roleTitle || '—'}</td>
                      <td className="figure text-ink-muted dark:text-dark-muted">{emp.contactPhone || '—'}</td>
                      <td className="figure text-right">
                        {emp.baseSalary === 0 ? (
                          <Badge tone="amber" title="Auto-created from a new user account — set a base salary to activate payroll for them.">
                            Needs setup
                          </Badge>
                        ) : (
                          formatCurrency(emp.baseSalary)
                        )}
                      </td>
                      <td className="figure text-right">{emp.commissionRate ? `${emp.commissionRate}%` : '—'}</td>
                      <td>
                        <Badge tone={emp.isActive ? 'teal' : 'rose'}>{emp.isActive ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="btn-ghost px-2.5 py-1.5 text-xs transition-all duration-200 hover:text-teal-dark dark:hover:text-dark-teal hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(47,111,107,0.25),0_4px_12px_-2px_rgba(47,111,107,0.25)] hover:-translate-y-0.5"
                            onClick={() => openGenerate(emp)}
                            disabled={!emp.isActive}
                            title={emp.isActive ? 'Run payroll for this employee' : 'Employee is inactive'}
                          >
                            <Icon name="reports" className="h-3.5 w-3.5" />
                            Run Payroll
                          </button>
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink dark:hover:text-dark-text hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] dark:hover:shadow-[0_0_0_1px_rgba(231,229,221,0.12),0_4px_12px_-2px_rgba(0,0,0,0.5)] hover:-translate-y-0.5"
                            onClick={() => openEdit(emp)}
                            aria-label={`Edit ${emp.name}`}
                          >
                            <Icon name="edit" className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : isLoadingRecords ? (
          <Loading message="Loading payroll records…" />
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            title="No payroll records"
            description="Run payroll for an employee to generate the first pay record."
            actionLabel="Run Payroll"
            onAction={() => openGenerate(null)}
            icon="🧾"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Period</th>
                  <th className="text-right">Base Salary</th>
                  <th className="text-right">Commission</th>
                  <th className="text-right">Total Payable</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="group">
                    <td className="font-medium">{rec.employeeName || '—'}</td>
                    <td className="text-ink-muted dark:text-dark-muted">
                      {formatDate(rec.periodStart)} – {formatDate(rec.periodEnd)}
                    </td>
                    <td className="figure text-right">{formatCurrency(rec.baseSalaryAmount)}</td>
                    <td className="figure text-right">{formatCurrency(rec.commissionAmount)}</td>
                    <td className="figure text-right font-semibold">{formatCurrency(rec.totalPayable)}</td>
                    <td>
                      <Badge tone={rec.paidStatus === 'PAID' ? 'teal' : 'amber'}>
                        {rec.paidStatus === 'PAID' ? `Paid ${formatDate(rec.paidDate)}` : 'Pending'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex justify-end">
                        {rec.paidStatus === 'PENDING' && (
                          <button
                            type="button"
                            className="btn-ghost px-2.5 py-1.5 text-xs transition-all duration-200 hover:text-teal-dark dark:hover:text-dark-teal hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(47,111,107,0.25),0_4px_12px_-2px_rgba(47,111,107,0.25)] hover:-translate-y-0.5"
                            onClick={() => handleMarkPaid(rec)}
                          >
                            <Icon name="checkCircle" className="h-3.5 w-3.5" />
                            Mark Paid
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

      <EmployeeFormModal
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        onSave={handleSaveEmployee}
        employee={activeEmployee}
        users={users}
        roles={roles}
        existingLinkedUserIds={employees.map((e) => e.userId).filter(Boolean)}
      />

      <GeneratePayrollModal
        isOpen={generateModal.isOpen}
        onClose={generateModal.close}
        onGenerated={handleGenerated}
        employees={employees.filter((e) => e.isActive)}
        preselected={generateFor}
      />
    </div>
  )
}

/**
 * Create: full HR intake form. Edit: only the fields payroll.service.js
 * actually persists on update (role_title, base_salary, commission_rate,
 * is_active) — name/contact/address are shown read-only with a short
 * explanation, since the backend has nowhere else for this form to send
 * them (see the module-level comment above).
 */
function EmployeeFormModal({ isOpen, onClose, onSave, employee, users, roles, existingLinkedUserIds }) {
  const isEdit = Boolean(employee)
  const [form, setForm] = useState({
    name: '',
    roleTitle: '',
    contactPhone: '',
    address: '',
    baseSalary: '',
    commissionRate: '',
    hireDate: '',
    userId: '',
    isActive: true,
    // New-employee login mode: 'new' creates a login account alongside
    // this Employee record (the default — most staff have a login),
    // 'existing' links an already-existing account that somehow isn't
    // linked yet (rare after new Users auto-create their own Employee),
    // 'none' is the deliberate payroll-only path for staff who should
    // never get system access (see the module comment at the top of
    // this file for why that's still supported).
    loginMode: 'new',
    email: '',
    password: '',
    role: '',
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (isOpen) {
      setForm({
        name: employee?.name || '',
        roleTitle: employee?.roleTitle || '',
        contactPhone: employee?.contactPhone || '',
        address: employee?.address || '',
        baseSalary: employee?.baseSalary ?? '',
        commissionRate: employee?.commissionRate ?? '',
        hireDate: employee?.hireDate ? employee.hireDate.slice(0, 10) : '',
        userId: employee?.userId || '',
        isActive: employee?.isActive ?? true,
        loginMode: 'new',
        email: '',
        password: '',
        role: roles[0]?.name || '',
      })
      setErrors({})
    }
  }, [isOpen, employee, roles])

  const availableUsers = users.filter((u) => !existingLinkedUserIds.includes(u.id))

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function validate() {
    const next = {}
    if (!isEdit && !form.name.trim()) next.name = 'Name is required.'
    if (!isEdit && !form.roleTitle.trim()) next.roleTitle = 'Role/title is required.'
    if (form.baseSalary === '' || Number(form.baseSalary) < 0) next.baseSalary = 'Enter a valid base salary.'
    if (form.commissionRate !== '' && Number(form.commissionRate) < 0) next.commissionRate = 'Commission rate cannot be negative.'
    if (!isEdit && form.loginMode === 'new') {
      if (!form.email.trim()) next.email = 'Email is required for a new login.'
      if (!form.password || form.password.length < 6) next.password = 'Password must be at least 6 characters.'
    }
    if (!isEdit && form.loginMode === 'existing' && !form.userId) {
      next.userId = 'Choose which existing account to link, or switch modes.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return

    if (isEdit) {
      onSave({
        roleTitle: form.roleTitle.trim(),
        baseSalary: Number(form.baseSalary),
        commissionRate: form.commissionRate === '' ? null : Number(form.commissionRate),
        isActive: form.isActive,
      })
      return
    }

    const payload = {
      name: form.name.trim(),
      roleTitle: form.roleTitle.trim(),
      contactPhone: form.contactPhone.trim() || null,
      address: form.address.trim() || null,
      baseSalary: Number(form.baseSalary),
      commissionRate: form.commissionRate === '' ? null : Number(form.commissionRate),
      hireDate: form.hireDate || null,
    }

    if (form.loginMode === 'new') {
      payload.newLogin = { email: form.email.trim(), password: form.password, role: form.role }
    } else if (form.loginMode === 'existing') {
      payload.userId = form.userId
    }
    // loginMode === 'none' → neither field set → backend creates a
    // payroll-only Employee with no linked login, same as before.

    onSave(payload)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? `Edit ${employee?.name}` : 'Add Employee'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {isEdit && (
          <p className="text-xs text-ink-muted dark:text-dark-muted bg-paper-dim dark:bg-dark-card2 rounded-lg px-3 py-2">
            Name, contact and address aren&apos;t editable here — they only change via the employee&apos;s own Profile
            page once linked to a login account.
          </p>
        )}

        {!isEdit && (
          <div>
            <label className="label-text" htmlFor="emp-name">
              Full name
            </label>
            <input
              id="emp-name"
              className="input-field"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Ayesha Malik"
            />
            {errors.name && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.name}</p>}
          </div>
        )}

        <div>
          <label className="label-text" htmlFor="emp-role">
            Role / title
          </label>
          <input
            id="emp-role"
            className="input-field"
            value={form.roleTitle}
            onChange={(e) => update('roleTitle', e.target.value)}
            placeholder="e.g. Sales Associate"
          />
          {errors.roleTitle && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.roleTitle}</p>}
        </div>

        {!isEdit && (
          <>
            <div>
              <label className="label-text" htmlFor="emp-phone">
                Contact phone <span className="text-ink-muted dark:text-dark-muted font-normal">(optional)</span>
              </label>
              <input
                id="emp-phone"
                className="input-field figure"
                value={form.contactPhone}
                onChange={(e) => update('contactPhone', e.target.value)}
                placeholder="03XX-XXXXXXX"
              />
            </div>
            <div>
              <label className="label-text" htmlFor="emp-address">
                Address <span className="text-ink-muted dark:text-dark-muted font-normal">(optional)</span>
              </label>
              <textarea
                id="emp-address"
                className="input-field"
                rows={2}
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-text" htmlFor="emp-salary">
              Base salary
            </label>
            <input
              id="emp-salary"
              type="number"
              min="0"
              step="0.01"
              className="input-field figure"
              value={form.baseSalary}
              onChange={(e) => update('baseSalary', e.target.value)}
              placeholder="0.00"
            />
            {errors.baseSalary && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.baseSalary}</p>}
          </div>
          <div>
            <label className="label-text" htmlFor="emp-commission">
              Commission rate % <span className="text-ink-muted dark:text-dark-muted font-normal">(optional)</span>
            </label>
            <input
              id="emp-commission"
              type="number"
              min="0"
              step="0.01"
              className="input-field figure"
              value={form.commissionRate}
              onChange={(e) => update('commissionRate', e.target.value)}
              placeholder="0.00"
            />
            {errors.commissionRate && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.commissionRate}</p>}
          </div>
        </div>

        {!isEdit && (
          <div>
            <label className="label-text" htmlFor="emp-hire-date">
              Hire date <span className="text-ink-muted dark:text-dark-muted font-normal">(optional, defaults to today)</span>
            </label>
            <input
              id="emp-hire-date"
              type="date"
              className="input-field"
              value={form.hireDate}
              onChange={(e) => update('hireDate', e.target.value)}
            />
          </div>
        )}

        {!isEdit && (
          <div className="border-t border-line dark:border-dark-border pt-4 space-y-4">
            <div>
              <label className="label-text" htmlFor="emp-login-mode">
                System access
              </label>
              <select
                id="emp-login-mode"
                className="input-field"
                value={form.loginMode}
                onChange={(e) => update('loginMode', e.target.value)}
              >
                <option value="new">Create a new login account for them</option>
                {availableUsers.length > 0 && <option value="existing">Link an existing account</option>}
                <option value="none">Payroll-only — no login access</option>
              </select>
              <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">
                {form.loginMode === 'new' && 'Creates their account and this HR record together.'}
                {form.loginMode === 'existing' && 'Attaches this HR record to an account that already exists.'}
                {form.loginMode === 'none' && 'For staff who should never get access to the system (e.g. warehouse labor).'}
              </p>
            </div>

            {form.loginMode === 'new' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label-text" htmlFor="emp-email">
                    Email
                  </label>
                  <input
                    id="emp-email"
                    type="email"
                    className="input-field"
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                    placeholder="name@company.com"
                  />
                  {errors.email && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="label-text" htmlFor="emp-password">
                    Password
                  </label>
                  <input
                    id="emp-password"
                    type="password"
                    className="input-field"
                    value={form.password}
                    onChange={(e) => update('password', e.target.value)}
                    minLength={6}
                  />
                  {errors.password && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.password}</p>}
                </div>
                <div>
                  <label className="label-text" htmlFor="emp-login-role">
                    Base role
                  </label>
                  <select id="emp-login-role" className="input-field" value={form.role} onChange={(e) => update('role', e.target.value)}>
                    {roles.map((role) => (
                      <option key={role.id} value={role.name}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {form.loginMode === 'existing' && (
              <div>
                <label className="label-text" htmlFor="emp-user">
                  Existing account
                </label>
                <select id="emp-user" className="input-field" value={form.userId} onChange={(e) => update('userId', e.target.value)}>
                  <option value="">Select an account…</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.email}
                    </option>
                  ))}
                </select>
                {errors.userId && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.userId}</p>}
              </div>
            )}
          </div>
        )}

        {isEdit && (
          <label className="flex items-center gap-2.5 text-sm text-ink dark:text-dark-text cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => update('isActive', e.target.checked)}
              className="rounded border-line dark:border-dark-border text-amber focus:ring-amber"
            />
            Active
          </label>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-accent">
            {isEdit ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Run Payroll — picks an (active) employee and a period, then calls
 * POST /payroll/records. The backend sums that employee's
 * CommissionRecords created inside the period on top of their base
 * salary (see payroll.service.js#generate) — nothing to compute here,
 * this just collects the three inputs it needs.
 */
function GeneratePayrollModal({ isOpen, onClose, onGenerated, employees, preselected }) {
  const [employeeId, setEmployeeId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setEmployeeId(preselected?.id || '')
      setPeriodStart('')
      setPeriodEnd('')
      setError('')
      setResult(null)
    }
  }, [isOpen, preselected])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!employeeId) {
      setError('Choose an employee.')
      return
    }
    if (!periodStart || !periodEnd) {
      setError('Choose both a period start and end date.')
      return
    }
    if (new Date(periodEnd) < new Date(periodStart)) {
      setError('Period end must be on or after the period start.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const res = await payrollService.generate({ employeeId, periodStart, periodEnd })
      setResult(res.data.data)
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  if (result) {
    return (
      <Modal isOpen={isOpen} onClose={onGenerated} title="Payroll Generated" size="sm">
        <div className="receipt-panel card-premium shine-sweep glow-teal p-5 space-y-3">
          <p className="font-display font-semibold text-ink dark:text-dark-text">{result.employeeName}</p>
          <p className="text-xs text-ink-muted dark:text-dark-muted">
            {formatDate(result.periodStart)} – {formatDate(result.periodEnd)}
          </p>
          <div className="border-t border-line dark:border-dark-border pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted dark:text-dark-muted">Base salary</span>
              <span className="figure">{formatCurrency(result.baseSalaryAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted dark:text-dark-muted">Commission</span>
              <span className="figure">{formatCurrency(result.commissionAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold text-ink dark:text-dark-text pt-1.5 border-t border-line dark:border-dark-border">
              <span>Total payable</span>
              <span className="figure">{formatCurrency(result.totalPayable)}</span>
            </div>
          </div>
        </div>
        <button type="button" className="btn-accent w-full mt-4 transition-all duration-200 hover:-translate-y-0.5" onClick={onGenerated}>
          Done
        </button>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Run Payroll" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label-text" htmlFor="gen-employee">
            Employee
          </label>
          <select
            id="gen-employee"
            className="input-field"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            disabled={Boolean(preselected)}
          >
            <option value="">Select an employee…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-text" htmlFor="gen-start">
              Period start
            </label>
            <input id="gen-start" type="date" className="input-field" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <label className="label-text" htmlFor="gen-end">
              Period end
            </label>
            <input id="gen-end" type="date" className="input-field" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        <p className="text-xs text-ink-muted dark:text-dark-muted bg-paper-dim dark:bg-dark-card2 rounded-lg px-3 py-2">
          Total payable = base salary + any commission earned on invoices within this period.
        </p>

        {error && <p className="text-xs text-rose dark:text-dark-rose">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="btn-accent disabled:opacity-60">
            {isSaving ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </form>
    </Modal>
  )
}



