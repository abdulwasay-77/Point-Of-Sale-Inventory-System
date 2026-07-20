
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
import { userService } from '../../services/userService'
import { ROLES } from '../../utils/constants'

const ROLE_TONES = {
  ADMIN: 'amber',
  ACCOUNTANT: 'teal',
  SALES_STAFF: 'teal',
  WAREHOUSE_STAFF: 'rose',
}

const ROLE_AVATAR_CLASSES = {
  ADMIN: 'bg-amber-light text-amber-dark',
  ACCOUNTANT: 'bg-teal-light text-teal-dark',
  SALES_STAFF: 'bg-teal-light text-teal-dark',
  WAREHOUSE_STAFF: 'bg-rose-light text-rose',
}

function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

/**
 * User & Role Management (admin only). Users are created with a base role
 * (which sets their default permissions), then an admin can optionally
 * fine-tune individual permissions per person via the Permissions modal —
 * see backend/src/config/permissions.js for the full model.
 *
 * Premium pass: a Dashboard-style stat row (reusing the exact `StatCard`
 * component) summarizes headcount, active accounts, and admins at a
 * glance — all derived client-side from the users already loaded — role
 * initial avatars replace the plain name cell (echoing Customers), and
 * the table/permissions groups pick up the shared lift + shine + glow
 * treatment used across the rest of the app.
 */
export default function UserManagementPage() {
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeUser, setActiveUser] = useState(null) // null = create mode
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [permissionsUser, setPermissionsUser] = useState(null)

  const formModal = useDisclosure()
  const confirmModal = useDisclosure()
  const permissionsModal = useDisclosure()

  async function loadUsers() {
    setIsLoading(true)
    try {
      const res = await userService.getAll()
      setUsers(res.data.data)
    } catch {
      setError('Could not load users.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
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
      setError(err.response?.data?.message || 'Could not save the user.')
    }
  }

  async function handleToggleActive(user) {
    try {
      await userService.update(user.id, { isActive: !user.isActive })
      await loadUsers()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update the user.')
    }
  }

  async function handleDeactivate() {
    try {
      await userService.deactivate(deactivateTarget.id)
      setDeactivateTarget(null)
      await loadUsers()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not deactivate the user.')
      setDeactivateTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        subtitle="Manage staff accounts, base roles, and per-user permission overrides."
        action={
          <button
            type="button"
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
            onClick={openCreate}
          >
            <Icon name="plus" className="h-4 w-4" />
            Add User
          </button>
        }
      />

      {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Users" value={stats.total} icon="users" tone="ink" />
          <StatCard label="Active" value={stats.active} icon="customers" tone="teal" />
          <StatCard label="Admins" value={stats.admins} icon="users" tone="amber" highlight />
          <StatCard label="Inactive" value={stats.inactive} icon="users" tone="rose" />
        </div>
      )}

      <div className="card card-premium glow-ink">
        {isLoading ? (
          <Loading message="Loading users…" />
        ) : users.length === 0 ? (
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
                          className={`section-icon rounded-full font-semibold text-xs ${
                            ROLE_AVATAR_CLASSES[user.role] || 'bg-ink text-paper'
                          }`}
                        >
                          {initialsOf(user.name)}
                        </span>
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </td>
                    <td className="text-ink-muted figure">{user.email}</td>
                    <td>
                      <Badge tone={ROLE_TONES[user.role] || 'amber'}>{user.role}</Badge>
                    </td>
                    <td>
                      <button type="button" onClick={() => handleToggleActive(user)}>
                        {user.isActive ? (
                          <Badge tone="teal">Active</Badge>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose pulse-dot" aria-hidden="true" />
                            <Badge tone="rose">Inactive</Badge>
                          </span>
                        )}
                      </button>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1.5 text-xs transition-all duration-200 hover:text-amber-dark hover:bg-white hover:shadow-[0_0_0_1px_rgba(232,163,61,0.3),0_4px_12px_-2px_rgba(232,163,61,0.3)] hover:-translate-y-0.5"
                          onClick={() => openPermissions(user)}
                        >
                          Permissions
                        </button>
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink hover:bg-white hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] hover:-translate-y-0.5"
                          onClick={() => openEdit(user)}
                          aria-label={`Edit ${user.name}`}
                        >
                          <Icon name="edit" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-rose hover:bg-white hover:shadow-[0_0_0_1px_rgba(193,80,46,0.3),0_4px_12px_-2px_rgba(193,80,46,0.3)] hover:-translate-y-0.5"
                          onClick={() => {
                            setDeactivateTarget(user)
                            confirmModal.open()
                          }}
                          aria-label={`Deactivate ${user.name}`}
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

      <UserFormModal isOpen={formModal.isOpen} onClose={formModal.close} onSave={handleSave} initialValues={activeUser} />

      <PermissionsModal
        isOpen={permissionsModal.isOpen}
        onClose={permissionsModal.close}
        user={permissionsUser}
        onSaved={loadUsers}
        onError={setError}
      />

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={confirmModal.close}
        onConfirm={handleDeactivate}
        title="Deactivate user"
        message={`Deactivate "${deactivateTarget?.name}"? They won't be able to log in anymore. This doesn't delete their sales history.`}
      />
    </div>
  )
}

/** Create/edit form for a user's name, email, password, and base role. */
function UserFormModal({ isOpen, onClose, onSave, initialValues }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: ROLES.SALES_STAFF })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setForm({
        name: initialValues?.name || '',
        email: initialValues?.email || '',
        password: '',
        role: initialValues?.role || ROLES.SALES_STAFF,
      })
    }
  }, [isOpen, initialValues])

  async function handleSubmit(e) {
    e.preventDefault()
    setIsSaving(true)
    try {
      await onSave(form)
    } finally {
      setIsSaving(false)
    }
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
          <select
            id="user-role"
            className="input-field"
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
          >
            {Object.values(ROLES).map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-muted mt-1">
            Sets default permissions. Fine-tune per person from the Permissions button afterwards.
          </p>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
          >
            {isSaving ? 'Saving…' : 'Save User'}
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
      onError(err.response?.data?.message || 'Could not save permissions.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Permissions — ${user?.name || ''}`} size="md">
      {isLoading ? (
        <Loading message="Loading permissions…" />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Starts from {user?.role}&rsquo;s defaults. Toggle anything to override it just for this person.
          </p>
          {Object.entries(grouped).map(([group, perms]) => (
            <div
              key={group}
              className="rounded-lg border border-line p-3 transition-all duration-200 hover:border-amber/50 hover:shadow-[0_4px_14px_-4px_rgba(232,163,61,0.25)]"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="section-icon h-6 w-6 rounded-md bg-amber-light text-amber-dark">
                  <Icon name="users" className="h-3.5 w-3.5" />
                </span>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{group}</p>
              </div>
              <div className="space-y-1.5 pl-1">
                {perms.map((perm) => (
                  <label key={perm.key} className="flex items-center gap-2.5 text-sm text-ink py-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checked[perm.key]}
                      onChange={(e) => setChecked((prev) => ({ ...prev, [perm.key]: e.target.checked }))}
                      className="rounded border-line text-amber focus:ring-amber"
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-3 pt-2 border-t border-line">
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
