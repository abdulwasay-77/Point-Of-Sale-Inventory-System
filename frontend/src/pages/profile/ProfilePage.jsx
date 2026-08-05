
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/common/PageHeader'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useDisclosure } from '../../hooks/useDisclosure'
import { profileService } from '../../services/profileService'
import { toAssetUrl } from '../../utils/assetUrl'
import { formatDate, formatCurrency } from '../../utils/formatters'

/**
 * Profile — always the logged-in user's own account. Editable: name,
 * email, contact phone, address, avatar, password. Read-only,
 * admin-managed: role title, base salary, commission rate, hire date
 * (see the Employee model comment in schema.prisma) — shown here for
 * visibility, changed only through the Payroll module.
 *
 * Logout lives here now, not the navbar — see Navbar.jsx.
 */
export default function ProfilePage() {
  const { logout, updateUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', contactPhone: '', address: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const passwordModal = useDisclosure()

  function load() {
    setIsLoading(true)
    profileService
      .get()
      .then((res) => {
        const p = res.data.data
        setProfile(p)
        setForm({ name: p.name, email: p.email, contactPhone: p.contactPhone || '', address: p.address || '' })
      })
      .catch(() => setError('Could not load your profile.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await profileService.update(form)
      setProfile(res.data.data)
      // Navbar reads name/role off AuthContext's user, not off this
      // page's own `profile` state — without this, a name change here
      // wouldn't show up there until the next login.
      updateUser({ name: res.data.data.name })
      setSuccess('Profile updated.')
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingAvatar(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const res = await profileService.updateAvatar(formData)
      setProfile(res.data.data)
      // Same reasoning as handleSave above — push the new avatar into
      // AuthContext so Navbar picks it up right away.
      updateUser({ avatarUrl: res.data.data.avatarUrl })
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsUploadingAvatar(false)
    }
    // Let the same file be re-selected later (e.g. remove then re-add
    // the exact same file) without the input silently no-op'ing.
    e.target.value = ''
  }

  async function handleAvatarRemove() {
    setIsRemovingAvatar(true)
    setError('')
    try {
      const res = await profileService.removeAvatar()
      setProfile(res.data.data)
      updateUser({ avatarUrl: null })
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsRemovingAvatar(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  if (isLoading) return <Loading message="Loading your profile…" />

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Your account, personal details, and preferences." />

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {success && <p className="text-sm text-teal-dark dark:text-dark-teal bg-teal-light dark:bg-dark-teal/15 rounded-lg px-3 py-2 mb-4">{success}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: avatar + quick actions */}
        <div className="card card-premium shine-sweep glow-teal p-5 flex flex-col items-center text-center">
          <div className="relative">
            {profile?.avatarUrl ? (
              <img src={toAssetUrl(profile.avatarUrl)} alt="" className="h-24 w-24 rounded-full object-cover" />
            ) : (
              <span className="h-24 w-24 rounded-full bg-teal dark:bg-dark-teal text-white flex items-center justify-center text-3xl font-semibold font-display">
                {profile?.name?.charAt(0) || 'U'}
              </span>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar || isRemovingAvatar}
              className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-amber text-white flex items-center justify-center shadow-card hover:bg-amber-dark dark:hover:bg-amber transition-colors disabled:opacity-60"
              aria-label={profile?.avatarUrl ? 'Change avatar' : 'Upload avatar'}
              title={profile?.avatarUrl ? 'Change avatar' : 'Upload avatar'}
            >
              <Icon name="upload" className="h-4 w-4" />
            </button>
            {/* Only shown once there's actually something to remove —
                a fresh account with just the initials badge has nothing
                to clear. */}
            {profile?.avatarUrl && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={isUploadingAvatar || isRemovingAvatar}
                className="absolute bottom-0 left-0 h-8 w-8 rounded-full bg-white dark:bg-dark-card text-rose dark:text-dark-rose flex items-center justify-center shadow-card border border-line dark:border-dark-border hover:bg-rose-light dark:hover:bg-dark-rose/15 transition-colors disabled:opacity-60"
                aria-label="Remove avatar"
                title="Remove avatar"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <p className="mt-3 font-semibold text-ink dark:text-dark-text">{profile?.name}</p>
          <p className="text-sm text-ink-muted dark:text-dark-muted">{profile?.email}</p>
          <span className="badge-amber mt-2">{profile?.role}</span>

          <div className="w-full border-t border-line dark:border-dark-border mt-4 pt-4 space-y-2">
            <button type="button" className="btn-outline w-full text-sm" onClick={passwordModal.open}>
              <Icon name="key" className="h-4 w-4" />
              Change Password
            </button>
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-rose dark:text-dark-rose hover:bg-rose-light dark:hover:bg-dark-rose/15 transition-colors"
              onClick={handleLogout}
            >
              <Icon name="logout" className="h-4 w-4" />
              Log Out
            </button>
          </div>
        </div>

        {/* Right: editable details + read-only employee info */}
        <div className="lg:col-span-2 space-y-5">
          <form onSubmit={handleSave} className="card card-premium shine-sweep glow-amber p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="section-icon bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
                <Icon name="userCircle" className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">Personal Details</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-text" htmlFor="profile-name">
                  Name
                </label>
                <input id="profile-name" className="input-field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label-text" htmlFor="profile-email">
                  Email
                </label>
                <input
                  id="profile-email"
                  type="email"
                  className="input-field"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-text" htmlFor="profile-phone">
                  Contact Phone
                </label>
                <input
                  id="profile-phone"
                  className="input-field"
                  value={form.contactPhone}
                  onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-text" htmlFor="profile-address">
                  Address
                </label>
                <input
                  id="profile-address"
                  className="input-field"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={isSaving} className="btn-accent disabled:opacity-60">
                {isSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>

          {profile?.employee && (
            <div className="card card-premium shine-sweep glow-ink p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="section-icon bg-steel-light dark:bg-dark-steel/15 text-steel-dark dark:text-dark-steel">
                  <Icon name="suppliers" className="h-3.5 w-3.5" />
                </span>
                <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">
                  Employment Details <span className="normal-case font-normal">(managed by admin)</span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-ink-muted dark:text-dark-muted text-xs">Role</p>
                  <p className="font-medium">{profile.employee.roleTitle}</p>
                </div>
                <div>
                  <p className="text-ink-muted dark:text-dark-muted text-xs">Hire Date</p>
                  <p className="font-medium">{formatDate(profile.employee.hireDate)}</p>
                </div>
                <div>
                  <p className="text-ink-muted dark:text-dark-muted text-xs">Base Salary</p>
                  <p className="font-medium figure">{formatCurrency(profile.employee.baseSalary)}</p>
                </div>
                <div>
                  <p className="text-ink-muted dark:text-dark-muted text-xs">Commission Rate</p>
                  <p className="font-medium figure">{profile.employee.commissionRate !== null ? `${profile.employee.commissionRate}%` : '—'}</p>
                </div>
              </div>
            </div>
          )}

          <div className="card card-premium shine-sweep glow-amber p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="section-icon bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
                <Icon name="sun" className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">Appearance</p>
            </div>
            <div className="flex gap-2">
              {['LIGHT', 'DARK'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    theme === t ? 'bg-amber text-white' : 'bg-paper-dim dark:bg-dark-card2 text-ink-muted dark:text-dark-muted border border-line dark:border-dark-border'
                  }`}
                >
                  <Icon name={t === 'DARK' ? 'moon' : 'sun'} className="h-4 w-4" />
                  {t === 'DARK' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ChangePasswordModal isOpen={passwordModal.isOpen} onClose={passwordModal.close} />
    </div>
  )
}

function ChangePasswordModal({ isOpen, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError('')
    }
  }, [isOpen])

  async function handleSubmit(e) {
    e.preventDefault()
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await profileService.changePassword(currentPassword, newPassword)
      onClose()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Password" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-text" htmlFor="pw-current">
            Current password
          </label>
          <input
            id="pw-current"
            type="password"
            className="input-field"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="label-text" htmlFor="pw-new">
            New password
          </label>
          <input id="pw-new" type="password" className="input-field" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <label className="label-text" htmlFor="pw-confirm">
            Confirm new password
          </label>
          <input
            id="pw-confirm"
            type="password"
            className="input-field"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-xs text-rose dark:text-dark-rose">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="btn-accent disabled:opacity-60">
            {isSaving ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </form>
    </Modal>
  )
}


