import { useState, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import { unitService } from '../../services/unitService'

/**
 * Business-managed units of measure (Piece, Box, Kg, ...) — replaces
 * what used to be a fixed list compiled into the app. Every product
 * needs one (see ProductFormModal's Unit of Measure dropdown); this page
 * is where an admin builds, renames, or removes them, the same shape as
 * Categories and Variations already work.
 */
export default function UnitsOfMeasurePage() {
  const [units, setUnits] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [showFormModal, setShowFormModal] = useState(false)
  const [activeUnit, setActiveUnit] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  function load() {
    setIsLoading(true)
    unitService
      .getAll()
      .then((res) => setUnits(res.data.data))
      .catch(() => setError('Could not load units.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setActiveUnit(null)
    setShowFormModal(true)
  }

  function openEdit(unit) {
    setActiveUnit(unit)
    setShowFormModal(true)
  }

  async function handleSave(values) {
    if (activeUnit) {
      await unitService.update(activeUnit.id, values)
    } else {
      await unitService.create(values)
    }
    setShowFormModal(false)
    load()
  }

  async function handleDelete() {
    await unitService.remove(deleteTarget.id)
    setDeleteTarget(null)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Units of Measure"
        subtitle="Define how products are counted or measured — Piece, Box, Kg, whatever this business actually sells by."
        action={
          <button className="btn-accent" onClick={openCreate}>
            + Add Unit
          </button>
        }
      />

      {error && <p className="text-sm text-rose dark:text-dark-rose mb-4">{error}</p>}

      {isLoading ? (
        <p className="text-ink-muted dark:text-dark-muted">Loading…</p>
      ) : units.length === 0 ? (
        <div className="card p-8 text-center text-ink-muted dark:text-dark-muted">
          No units yet — add one to start adding products.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">
                  Abbreviation
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">
                  Products
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-dark-border">
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-ink dark:text-dark-text">{u.name}</td>
                  <td className="px-4 py-3 text-ink-muted dark:text-dark-muted figure">{u.abbreviation}</td>
                  <td className="px-4 py-3 text-ink-muted dark:text-dark-muted figure">{u.productCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="btn-ghost px-2 py-1.5 hover:text-ink dark:hover:text-dark-text"
                        onClick={() => openEdit(u)}
                        aria-label={`Edit ${u.name}`}
                      >
                        <Icon name="edit" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={u.productCount > 0}
                        className="btn-ghost px-2 py-1.5 hover:text-rose dark:hover:text-dark-rose disabled:opacity-30 disabled:pointer-events-none"
                        onClick={() => setDeleteTarget(u)}
                        aria-label={`Delete ${u.name}`}
                        title={u.productCount > 0 ? 'Change every product using this unit first.' : undefined}
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

      {showFormModal && (
        <UnitFormModal
          isOpen={showFormModal}
          onClose={() => setShowFormModal(false)}
          onSave={handleSave}
          unit={activeUnit}
        />
      )}

      {deleteTarget && (
        <Modal isOpen onClose={() => setDeleteTarget(null)} title="Delete unit?" size="sm">
          <div className="p-6 space-y-4">
            <p className="text-sm text-ink dark:text-dark-text">
              Delete <strong>{deleteTarget.name}</strong>? This can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn-accent bg-rose hover:bg-rose/90" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function UnitFormModal({ isOpen, onClose, onSave, unit }) {
  const [name, setName] = useState(unit?.name || '')
  const [abbreviation, setAbbreviation] = useState(unit?.abbreviation || '')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !abbreviation.trim()) {
      setError('Both name and abbreviation are required.')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      await onSave({ name: name.trim(), abbreviation: abbreviation.trim() })
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this unit.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={unit ? `Edit Unit — ${unit.name}` : 'Add Unit'} size="sm">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="label-text" htmlFor="unit-name">
            Name
          </label>
          <input
            id="unit-name"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Piece, Box, Kilogram"
          />
        </div>
        <div>
          <label className="label-text" htmlFor="unit-abbr">
            Abbreviation
          </label>
          <input
            id="unit-abbr"
            className="input-field"
            value={abbreviation}
            onChange={(e) => setAbbreviation(e.target.value)}
            placeholder="e.g. pc, box, kg"
          />
          <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">
            Shown on receipts and the POS cart, where space is tight.
          </p>
        </div>
        {error && <p className="text-sm text-rose dark:text-dark-rose">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="btn-accent">
            {isSaving ? 'Saving…' : 'Save Unit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
