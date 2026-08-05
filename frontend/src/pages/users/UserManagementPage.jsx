
import { useState, useEffect, useMemo } from 'react'
import PageHeader from '../../components/common/PageHeader'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import Badge from '../../components/common/Badge'
import Icon from '../../components/common/Icon'
import StatCard from '../../components/dashboard/StatCard'
import { useDisclosure } from '../../hooks/useDisclosure'
import { useAuth } from '../../hooks/useAuth'
import { userService } from '../../services/userService'
import { rolesService } from '../../services/rolesService'

// Every role is a plain admin-defined row now — there's no "built-in"
// role to special-case (see roles.service.js), so every role/user chip
// gets the same neutral styling instead of a per-name lookup table.
const DEFAULT_ROLE_TONE = 'amber'
const DEFAULT_ROLE_AVATAR_CLASS = 'bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber'

function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

/**
 * User & Role Management (admin only — USERS_MANAGE).
 *
 * Two tabs:
 *  - Users: create staff logins with a base role (sets their default
 *    permissions), then fine-tune individual permissions per person via
 *    the Permissions modal. The primary admin account (see
 *    User.is_primary_admin in schema.prisma) can't be edited,
 *    deactivated, or have its permissions changed from here by anyone
 *    else — its row is shown but its action buttons stay disabled.
 *  - Roles: fully dynamic — there's no fixed set of roles baked into the
 *    app. A new role starts with ZERO permissions; an admin builds
 *    whatever role structure this business actually needs from scratch.
 *
 * See backend/src/config/permissions.js for the full permission model.
 */
export default function UserManagementPage() {
  const { user: currentUser } = useAuth()
  const [tab, setTab] = useState('users') // 'users' | 'roles'

  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeUser, setActiveUser] = useState(null) // null = create mode
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [permissionsUser, setPermissionsUser] = useState(null)
  const [activeRole, setActiveRole] = useState(null) // null = create mode
  const [deleteRoleTarget, setDeleteRoleTarget] = useState(null)

  const formModal = useDisclosure()
  const confirmModal = useDisclosure()
  const permissionsModal = useDisclosure()
  const roleFormModal = useDisclosure()
  const deleteRoleModal = useDisclosure()

  async function loadAll() {
    setIsLoading(true)
    try {
      const [usersRes, rolesRes] = await Promise.all([userService.getAll(), rolesService.getAll()])
      setUsers(usersRes.data.data)
      setRoles(rolesRes.data.data)
    } catch {
      setError('Could not load users and roles.')
    } finally {
      setIsLoading(false)
    }
  }

  async function loadUsers() {
    const res = await userService.getAll()
    setUsers(res.data.data)
  }

  async function loadRoles() {
    const res = await rolesService.getAll()
    setRoles(res.data.data)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const stats = useMemo(() => {
    const active = users.filter((u) => u.isActive).length
    const admins = users.filter((u) => u.role === 'ADMIN').length
    return { total: users.length, active, inactive: users.length - active, admins }
  }, [users])

  function openCreate() {
    setActiveUser(null)
    formModal.open()
  }

  function openEdit(user) {
    setActiveUser(user)
    formModal.open()
  }

  function openPermissions(user) {
    setPermissionsUser(user)
    permissionsModal.open()
  }

  function openCreateRole() {
    setActiveRole(null)
    roleFormModal.open()
  }

  function openEditRole(role) {
    setActiveRole(role)
    roleFormModal.open()
  }

  async function handleSave(values) {
    try {
      if (activeUser) {
        await userService.update(activeUser.id, { name: values.name, role: values.role })
      } else {
        await userService.create(values)
      }
      formModal.close()
      await loadUsers()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    }
  }

  function handleStatusClick(user) {
    // You can't change your own active status — the Status cell is
    // non-interactive for this row anyway (see below), this is just a
    // safety net; the backend enforces the same rule.
    if (user.id === currentUser?.id) return
    if (user.isActive) {
      // Deactivating is the "destructive-feeling" direction — this is
      // now the only way to remove a user from active use (there's no
      // separate delete button; see handleDeactivate below for why a
      // real delete isn't offered at all), so it goes through the same
      // confirm dialog a delete button would.
      setDeactivateTarget(user)
      confirmModal.open()
    } else {
      // Reactivating is safe and reversible any time, so it happens
      // immediately on click — no confirmation needed.
      handleReactivate(user)
    }
  }

  async function handleReactivate(user) {
    try {
      await userService.update(user.id, { isActive: true })
      await loadUsers()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    }
  }

  async function handleDeactivate() {
    try {
      await userService.deactivate(deactivateTarget.id)
      setDeactivateTarget(null)
      await loadUsers()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
      setDeactivateTarget(null)
    }
  }

  async function handleSaveRole(values) {
    if (activeRole) {
      await rolesService.update(activeRole.id, values)
    } else {
      await rolesService.create(values)
    }
    roleFormModal.close()
    await loadRoles()
  }

  async function handleDeleteRole() {
    try {
      await rolesService.remove(deleteRoleTarget.id)
      setDeleteRoleTarget(null)
      deleteRoleModal.close()
      await loadRoles()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
      setDeleteRoleTarget(null)
      deleteRoleModal.close()
    }
  }

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        subtitle="Manage staff accounts, base roles, and per-user permission overrides."
        action={
          tab === 'users' ? (
            <button
              type="button"
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
              onClick={openCreate}
            >
              <Icon name="plus" className="h-4 w-4" />
              Add User
            </button>
          ) : (
            <button
              type="button"
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
              onClick={openCreateRole}
            >
              <Icon name="plus" className="h-4 w-4" />
              Add Role
            </button>
          )
        }
      />

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && tab === 'users' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Users" value={stats.total} icon="users" tone="ink" />
          <StatCard label="Active" value={stats.active} icon="customers" tone="teal" />
          <StatCard label="Admins" value={stats.admins} icon="users" tone="amber" highlight />
          <StatCard label="Inactive" value={stats.inactive} icon="users" tone="rose" />
        </div>
      )}

      <div className="card card-premium glow-ink">
        <div className="flex items-center gap-1 p-4 border-b border-line dark:border-dark-border">
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'users' ? 'bg-amber text-white' : 'text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2'
            }`}
          >
            Users
          </button>
          <button
            type="button"
            onClick={() => setTab('roles')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'roles' ? 'bg-amber text-white' : 'text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2'
            }`}
          >
            Roles
          </button>
        </div>

        {isLoading ? (
          <Loading message="Loading…" />
        ) : tab === 'users' ? (
          users.length === 0 ? (
            <EmptyState title="No users yet" description="Add your first staff account." actionLabel="Add User" onAction={openCreate} icon="👤" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base table-premium">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="group">
                      <td>
                        <div className="flex items-center gap-3">
                          <span
                            className={`section-icon rounded-full font-semibold text-xs ${DEFAULT_ROLE_AVATAR_CLASS}`}
                          >
                            {initialsOf(user.name)}
                          </span>
                          <span className="font-medium">{user.name}</span>
                          {user.isPrimaryAdmin && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-amber"
                              title="This is the primary admin account — it can't be edited or deactivated by anyone else."
                            />
                          )}
                        </div>
                      </td>
                      <td className="text-ink-muted dark:text-dark-muted figure">{user.email}</td>
                      <td>
                        <Badge tone={DEFAULT_ROLE_TONE}>{user.role || 'Admin'}</Badge>
                      </td>
                      <td>
                        {user.id === currentUser?.id || user.isPrimaryAdmin ? (
                          // Your own row: status is a static label, not a
                          // button — you can't deactivate the account
                          // you're currently signed in with (it would lock
                          // you out immediately). See handleStatusClick.
                          // The primary admin's row is the same for
                          // everyone else too — see users.service.js.
                          <span title={user.isPrimaryAdmin ? "The primary admin account can't be deactivated by anyone else." : "You can't change your own active status while logged in."}>
                            {user.isActive ? (
                              <Badge tone="teal">Active</Badge>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose dark:bg-dark-rose pulse-dot" aria-hidden="true" />
                                <Badge tone="rose">Inactive</Badge>
                              </span>
                            )}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatusClick(user)}
                            title={user.isActive ? `Deactivate ${user.name}` : `Reactivate ${user.name}`}
                            className="inline-flex items-center rounded-full cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:brightness-95 dark:hover:brightness-125 hover:shadow-[0_4px_12px_-4px_rgba(31,36,48,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-bg"
                          >
                            {user.isActive ? (
                              <Badge tone="teal">Active</Badge>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose dark:bg-dark-rose pulse-dot" aria-hidden="true" />
                                <Badge tone="rose">Inactive</Badge>
                              </span>
                            )}
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={user.id === currentUser?.id || user.isPrimaryAdmin}
                            className="btn-ghost px-2 py-1.5 text-xs transition-all duration-200 hover:text-amber-dark dark:hover:text-amber hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(232,163,61,0.3),0_4px_12px_-2px_rgba(232,163,61,0.3)] hover:-translate-y-0.5 disabled:opacity-30 disabled:pointer-events-none disabled:hover:translate-y-0"
                            onClick={() => openPermissions(user)}
                            title={user.id === currentUser?.id ? "You can't change your own permissions while logged in." : user.isPrimaryAdmin ? "The primary admin's permissions can't be overridden." : undefined}
                          >
                            Override Permissions
                          </button>
                          <button
                            type="button"
                            disabled={user.id === currentUser?.id || user.isPrimaryAdmin}
                            className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink dark:hover:text-dark-text hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] dark:hover:shadow-[0_0_0_1px_rgba(231,229,221,0.12),0_4px_12px_-2px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 disabled:opacity-30 disabled:pointer-events-none disabled:hover:translate-y-0"
                            onClick={() => openEdit(user)}
                            aria-label={`Edit ${user.name}`}
                            title={user.id === currentUser?.id ? "You can't edit your own account while logged in." : user.isPrimaryAdmin ? "The primary admin account can't be edited by anyone else." : undefined}
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
        ) : roles.length === 0 ? (
          <EmptyState title="No roles yet" description="Add your first role." actionLabel="Add Role" onAction={openCreateRole} icon="🛡️" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Permissions</th>
                  <th>Users</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="group">
                    <td>
                      <div className="flex items-center gap-2">
                        <Badge tone={DEFAULT_ROLE_TONE}>{role.name}</Badge>
                      </div>
                    </td>
                    <td className="text-ink-muted dark:text-dark-muted text-sm">
                      {role.permissions.length === 0 ? 'None yet' : `${role.permissions.length} granted`}
                    </td>
                    <td className="figure">{role.userCount}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink dark:hover:text-dark-text hover:bg-white dark:hover:bg-dark-card hover:-translate-y-0.5"
                          onClick={() => openEditRole(role)}
                          aria-label={`Edit ${role.name}`}
                        >
                          <Icon name="edit" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={role.userCount > 0}
                          className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-rose dark:hover:text-dark-rose hover:bg-white dark:hover:bg-dark-card hover:-translate-y-0.5 disabled:opacity-30 disabled:pointer-events-none"
                          onClick={() => {
                            setDeleteRoleTarget(role)
                            deleteRoleModal.open()
                          }}
                          aria-label={`Delete ${role.name}`}
                          title={role.userCount > 0 ? 'Reassign every user with this role before deleting it.' : undefined}
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UserFormModal
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        onSave={handleSave}
        initialValues={activeUser}
        roles={roles}
        onGoToRoles={() => {
          formModal.close()
          setTab('roles')
        }}
      />

      <PermissionsModal
        isOpen={permissionsModal.isOpen}
        onClose={permissionsModal.close}
        user={permissionsUser}
        onSaved={loadUsers}
        onError={setError}
      />

      <RoleFormModal
        isOpen={roleFormModal.isOpen}
        onClose={roleFormModal.close}
        onSave={handleSaveRole}
        role={activeRole}
        onError={setError}
      />

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={confirmModal.close}
        onConfirm={handleDeactivate}
        title="Deactivate user"
        message={`"${deactivateTarget?.name}" will be deactivated and won't be able to log in. You can reactivate them anytime by clicking their status again. This doesn't delete their sales history.`}
      />

      <ConfirmDialog
        isOpen={deleteRoleModal.isOpen}
        onClose={deleteRoleModal.close}
        onConfirm={handleDeleteRole}
        title="Delete role"
        message={`Delete the "${deleteRoleTarget?.name}" role? This can't be undone.`}
      />
    </div>
  )
}

/**
 * Create/edit form for a user's name, email, password, and base role.
 *
 * Two things added beyond the basics:
 *  - "Paid employee" toggle: whether this login also gets a linked HR/
 *    payroll (Employee) record is a real decision, not something tied
 *    to role — a hired manager given Admin rights is on payroll, a
 *    business partner given the same rights might not be. See
 *    users.service.js#createUser.
 *  - A confirmation step when the chosen role includes USERS_MANAGE
 *    (can manage other users, roles, and settings) — not a block, just
 *    making sure granting that level of access is a deliberate click.
 */
function UserFormModal({ isOpen, onClose, onSave, initialValues, roles, onGoToRoles }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '' })
  const [isPaidEmployee, setIsPaidEmployee] = useState(true)
  const [employee, setEmployee] = useState({ roleTitle: '', baseSalary: '', commissionRate: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [confirmingAdminGrant, setConfirmingAdminGrant] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setForm({
        name: initialValues?.name || '',
        email: initialValues?.email || '',
        password: '',
        role: initialValues?.role || roles[0]?.name || '',
      })
      setIsPaidEmployee(true)
      setEmployee({ roleTitle: '', baseSalary: '', commissionRate: '' })
      setConfirmingAdminGrant(false)
    }
  }, [isOpen, initialValues, roles])

  const selectedRole = roles.find((r) => r.name === form.role)
  const grantsUserManagement = selectedRole?.permissions?.includes('USERS_MANAGE')

  async function submitForReal() {
    setIsSaving(true)
    try {
      const payload = { ...form }
      if (!initialValues) {
        payload.employee = isPaidEmployee ? employee : null
      }
      await onSave(payload)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // Grantng USERS_MANAGE is the same level of access as the person
    // creating this account has themselves — worth one deliberate
    // confirmation click rather than saving straight away.
    if (grantsUserManagement && !confirmingAdminGrant) {
      setConfirmingAdminGrant(true)
      return
    }
    await submitForReal()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialValues ? 'Edit User' : 'Add User'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-text" htmlFor="user-name">
            Name
          </label>
          <input
            id="user-name"
            className="input-field"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="label-text" htmlFor="user-email">
            Email
          </label>
          <input
            id="user-email"
            type="email"
            className="input-field"
            value={form.email}
            disabled={!!initialValues}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
        </div>
        {!initialValues && (
          <div>
            <label className="label-text" htmlFor="user-password">
              Password
            </label>
            <input
              id="user-password"
              type="password"
              className="input-field"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              required
              minLength={6}
            />
          </div>
        )}
        <div>
          <label className="label-text" htmlFor="user-role">
            Base Role
          </label>
          {roles.length === 0 ? (
            <div className="rounded-lg border border-amber/40 bg-amber/10 p-3">
              <p className="text-sm text-ink dark:text-dark-text">
                No roles exist yet — create one first so it has permissions to assign here.
              </p>
              <button
                type="button"
                onClick={onGoToRoles}
                className="mt-2 text-sm font-medium text-amber-dark dark:text-amber hover:underline"
              >
                Go to Roles tab →
              </button>
            </div>
          ) : (
            <>
              <select
                id="user-role"
                className="input-field"
                value={form.role}
                onChange={(e) => { setForm((prev) => ({ ...prev, role: e.target.value })); setConfirmingAdminGrant(false) }}
                required
              >
                <option value="" disabled>
                  Select a role…
                </option>
                {roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">
                Sets default permissions. Fine-tune per person from the Permissions button afterwards, or manage the role
                itself from the Roles tab.
              </p>
            </>
          )}
        </div>

        {!initialValues && (
          <div className="rounded-lg border border-line dark:border-dark-border p-3">
            <label className="flex items-center gap-2.5 text-sm text-ink dark:text-dark-text cursor-pointer">
              <input
                type="checkbox"
                checked={isPaidEmployee}
                onChange={(e) => setIsPaidEmployee(e.target.checked)}
                className="rounded border-line dark:border-dark-border text-amber focus:ring-amber"
              />
              This person is a paid employee (adds a Payroll record)
            </label>
            <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">
              Leave unchecked for someone who isn't paid a salary through this system — e.g. a business partner or
              co-owner given the same access rather than a hired staff member.
            </p>
            {isPaidEmployee && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <input
                  className="input-field"
                  placeholder="Job title"
                  value={employee.roleTitle}
                  onChange={(e) => setEmployee((prev) => ({ ...prev, roleTitle: e.target.value }))}
                />
                <input
                  className="input-field"
                  type="number"
                  placeholder="Base salary"
                  value={employee.baseSalary}
                  onChange={(e) => setEmployee((prev) => ({ ...prev, baseSalary: e.target.value }))}
                />
              </div>
            )}
          </div>
        )}

        {grantsUserManagement && confirmingAdminGrant && (
          <p className="text-sm text-amber-dark dark:text-amber bg-amber-light dark:bg-dark-amber/15 rounded-lg px-3 py-2">
            The "{form.role}" role can manage users, roles, and settings — the same level of access as your own
            account. Click "Save User" again to confirm.
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
          >
            {isSaving ? 'Saving…' : confirmingAdminGrant ? 'Confirm & Save User' : 'Save User'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Grid of individually toggleable permissions for one user. */
function PermissionsModal({ isOpen, onClose, user, onSaved, onError }) {
  const [catalog, setCatalog] = useState([])
  const [checked, setChecked] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen && user) {
      setIsLoading(true)
      Promise.all([userService.getPermissionCatalog(), userService.getById(user.id)])
        .then(([catalogRes, userRes]) => {
          setCatalog(catalogRes.data.data.catalog)
          const granted = new Set(userRes.data.data.permissions)
          const map = {}
          catalogRes.data.data.catalog.forEach((p) => {
            map[p.key] = granted.has(p.key)
          })
          setChecked(map)
        })
        .catch(() => onError('Could not load permissions.'))
        .finally(() => setIsLoading(false))
    }
  }, [isOpen, user]) // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = catalog.reduce((acc, perm) => {
    acc[perm.group] = acc[perm.group] || []
    acc[perm.group].push(perm)
    return acc
  }, {})

  async function handleSave() {
    setIsSaving(true)
    try {
      const permissions = catalog.map((p) => ({ key: p.key, enabled: !!checked[p.key] }))
      await userService.setPermissions(user.id, permissions)
      onClose()
      await onSaved()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Override Permissions — ${user?.name || ''}`} size="md">
      {isLoading ? (
        <Loading message="Loading permissions…" />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted dark:text-dark-muted">
            Starts from {user?.role}&rsquo;s permissions. Toggle anything to override it just for this person.
          </p>
          {Object.entries(grouped).map(([group, perms]) => (
            <div
              key={group}
              className="rounded-lg border border-line dark:border-dark-border p-3 transition-all duration-200 hover:border-amber/50 hover:shadow-[0_4px_14px_-4px_rgba(232,163,61,0.25)]"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="section-icon h-6 w-6 rounded-md bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
                  <Icon name="users" className="h-3.5 w-3.5" />
                </span>
                <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">{group}</p>
              </div>
              <div className="space-y-1.5 pl-1">
                {perms.map((perm) => (
                  <label key={perm.key} className="flex items-center gap-2.5 text-sm text-ink dark:text-dark-text py-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checked[perm.key]}
                      onChange={(e) => setChecked((prev) => ({ ...prev, [perm.key]: e.target.checked }))}
                      className="rounded border-line dark:border-dark-border text-amber focus:ring-amber"
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-3 pt-2 border-t border-line dark:border-dark-border">
            <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
              onClick={handleSave}
            >
              {isSaving ? 'Saving…' : 'Save Permissions'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/**
 * Create/edit form for a role. New roles start completely unchecked —
 * nothing is inherited, an admin grants exactly what's needed. Every
 * role, including its name, is editable here — there's no "built-in"
 * exception anymore (see roles.service.js).
 */
function RoleFormModal({ isOpen, onClose, onSave, role, onError }) {
  const isEdit = Boolean(role)
  const [name, setName] = useState('')
  const [catalog, setCatalog] = useState([])
  const [checked, setChecked] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true)
      setName(role?.name || '')
      userService
        .getPermissionCatalog()
        .then((res) => {
          const fullCatalog = res.data.data.catalog
          setCatalog(fullCatalog)
          const granted = new Set(role?.permissions || [])
          const map = {}
          fullCatalog.forEach((p) => {
            map[p.key] = granted.has(p.key)
          })
          setChecked(map)
        })
        .catch(() => onError('Could not load the permissions list.'))
        .finally(() => setIsLoading(false))
    }
  }, [isOpen, role]) // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = catalog.reduce((acc, perm) => {
    acc[perm.group] = acc[perm.group] || []
    acc[perm.group].push(perm)
    return acc
  }, {})

  async function handleSave() {
    if (!name.trim()) {
      onError('Role name is required.')
      return
    }
    setIsSaving(true)
    try {
      const permissions = catalog.filter((p) => checked[p.key]).map((p) => p.key)
      const payload = { name: name.trim(), permissions }
      await onSave(payload)
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? `Edit Role — ${role.name}` : 'Add Role'} size="md">
      {isLoading ? (
        <Loading message="Loading permissions…" />
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label-text" htmlFor="role-name">
              Role name
            </label>
            <input
              id="role-name"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Delivery Rider"
              required
            />
            {!isEdit && (
              <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">
                Starts with no permissions — check off exactly what this role needs below.
              </p>
            )}
          </div>

          {Object.entries(grouped).map(([group, perms]) => (
            <div
              key={group}
              className="rounded-lg border border-line dark:border-dark-border p-3 transition-all duration-200 hover:border-amber/50 hover:shadow-[0_4px_14px_-4px_rgba(232,163,61,0.25)]"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="section-icon h-6 w-6 rounded-md bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
                  <Icon name="users" className="h-3.5 w-3.5" />
                </span>
                <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">{group}</p>
              </div>
              <div className="space-y-1.5 pl-1">
                {perms.map((perm) => (
                  <label
                    key={perm.key}
                    className="flex items-center gap-2.5 text-sm text-ink dark:text-dark-text py-0.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!!checked[perm.key]}
                      onChange={(e) => setChecked((prev) => ({ ...prev, [perm.key]: e.target.checked }))}
                      className="rounded border-line dark:border-dark-border text-amber focus:ring-amber"
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-3 pt-2 border-t border-line dark:border-dark-border">
            <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
              onClick={handleSave}
            >
              {isSaving ? 'Saving…' : 'Save Role'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}


