import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import SearchInput from '../../components/common/SearchInput'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import EmptyState from '../../components/common/EmptyState'
import Pagination from '../../components/common/Pagination'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import StatCard from '../../components/dashboard/StatCard'
import { useDisclosure } from '../../hooks/useDisclosure'
import { usePermissions } from '../../hooks/usePermissions'
import { unitService } from '../../services/unitService'
import UnitMeasurementTypeSelect from './UnitMeasurementTypeSelect'

const PAGE_SIZE = 6

const MEASUREMENT_TYPE_LABELS = {
  COUNT: 'Count',
  AREA: 'Area',
  LENGTH: 'Length',
  WEIGHT: 'Weight',
  VOLUME: 'Volume',
  OTHER: 'Other',
}

/**
 * Business-managed units of measure (Piece, Box, Kg, ...) — replaces
 * what used to be a fixed list compiled into the app. Every product
 * needs one (see ProductFormModal's Unit of Measure dropdown); this page
 * is where an admin builds, renames, or removes them, the same shape as
 * Categories and Variations already work.
 *
 * Each unit also carries a `measurementType` (Count, Area, Length,
 * Weight, Volume, Other) — chosen explicitly when the unit is created,
 * never guessed from its name (units are dynamic/free-form, so an admin
 * could name a Count unit "Bundle" or an Area unit "Panel"). Only
 * Area-type units are selectable as a product's optional coverage unit
 * (see AreaCoverageFields.jsx on the product form). Once any product uses
 * a unit — either as its sale unit or its coverage unit — that unit's
 * type locks from editing, so it can't be changed out from under
 * products that already depend on it (enforced in units.service.js#update,
 * not just hidden here).
 *
 * Premium pass: brought up to parity with Categories/Variations — a
 * Dashboard-style stat row (reusing `StatCard`), search + pagination,
 * `table-premium` row styling, and a persistent tinted wash + "Unused"
 * signal on units no product references yet (sale or coverage), the
 * same data-quality treatment those two pages use.
 */
export default function UnitsOfMeasurePage() {
  const { has } = usePermissions()
  const canManage = has('UNITS_MANAGE')
  const [units, setUnits] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [activeUnit, setActiveUnit] = useState(null) // null = create mode
  const [deleteTarget, setDeleteTarget] = useState(null)

  const formModal = useDisclosure()
  const confirmModal = useDisclosure()

  async function loadUnits() {
    setIsLoading(true)
    try {
      const res = await unitService.getAll()
      setUnits(res.data.data)
      setError('')
    } catch {
      setError('Could not load units.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUnits()
  }, [])

  const stats = useMemo(() => {
    const totalProducts = units.reduce(
      (sum, u) => sum + (Number(u.productCount) || 0) + (Number(u.coverageProductCount) || 0),
      0,
    )
    const areaUnits = units.filter((u) => u.measurementType === 'AREA').length
    const empty = units.filter((u) => !u.productCount && !u.coverageProductCount).length
    return { count: units.length, totalProducts, areaUnits, empty }
  }, [units])

  const filtered = useMemo(
    () =>
      units.filter(
        (u) =>
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.abbreviation.toLowerCase().includes(query.toLowerCase()),
      ),
    [units, query],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setActiveUnit(null)
    formModal.open()
  }

  function openEdit(unit) {
    setActiveUnit(unit)
    formModal.open()
  }

  async function handleSave(values) {
    if (activeUnit) {
      await unitService.update(activeUnit.id, values)
    } else {
      await unitService.create(values)
    }
    formModal.close()
    await loadUnits()
  }

  async function handleDelete() {
    try {
      await unitService.remove(deleteTarget.id)
      setDeleteTarget(null)
      await loadUnits()
    } catch {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Units of Measure"
        subtitle="Define how products are counted or measured — Piece, Box, Kg, whatever this business actually sells by."
        action={
          canManage && (
            <button
              type="button"
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
              onClick={openCreate}
            >
              <Icon name="plus" className="h-4 w-4" />
              Add Unit
            </button>
          )
        }
      />

      {error && (
        <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Units" value={stats.count} icon="unitOfMeasure" tone="ink" />
          <StatCard label="Products Using Units" value={stats.totalProducts} icon="products" tone="teal" />
          <StatCard label="Area Units" value={stats.areaUnits} icon="unitOfMeasure" tone="amber" highlight />
          <StatCard label="Unused Units" value={stats.empty} icon="unitOfMeasure" tone="rose" />
        </div>
      )}

      <div className="card card-premium glow-teal">
        <div className="p-4 border-b border-line dark:border-dark-border">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v)
              setPage(1)
            }}
            placeholder="Search units…"
            className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <Loading message="Loading units…" />
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No units found"
            description="Try a different search, or add your first unit — e.g. Piece, Box, or Kilogram."
            actionLabel={canManage ? 'Add Unit' : undefined}
            onAction={canManage ? openCreate : undefined}
            icon="📏"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Abbreviation</th>
                  <th>Type</th>
                  <th>Products</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((u) => {
                  const totalUsage = (u.productCount || 0) + (u.coverageProductCount || 0)
                  const isEmpty = !totalUsage
                  return (
                    <tr key={u.id} className={`group ${isEmpty ? 'bg-rose-light/20 dark:bg-dark-rose/15' : ''}`}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span
                            className={`section-icon ${
                              isEmpty
                                ? 'bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose'
                                : 'bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal'
                            }`}
                          >
                            <Icon name="unitOfMeasure" className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-medium transition-colors duration-200 group-hover:text-teal-dark dark:group-hover:text-dark-teal">
                            {u.name}
                          </span>
                        </div>
                      </td>
                      <td className="text-ink-muted dark:text-dark-muted figure">{u.abbreviation}</td>
                      <td>
                        {u.measurementType === 'AREA' ? (
                          <span className="badge-amber">Area</span>
                        ) : (
                          <span className="text-ink-muted dark:text-dark-muted">
                            {MEASUREMENT_TYPE_LABELS[u.measurementType] || u.measurementType}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={isEmpty ? 'badge-rose figure' : 'badge-teal figure'}>{totalUsage}</span>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {canManage && (
                            <button
                              type="button"
                              className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink dark:hover:text-dark-text hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] dark:hover:shadow-[0_0_0_1px_rgba(231,229,221,0.12),0_4px_12px_-2px_rgba(0,0,0,0.5)] hover:-translate-y-0.5"
                              onClick={() => openEdit(u)}
                              aria-label={`Edit ${u.name}`}
                            >
                              <Icon name="edit" className="h-4 w-4" />
                            </button>
                          )}
                          {canManage && (
                            <button
                              type="button"
                              disabled={!isEmpty}
                              className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-rose dark:hover:text-dark-rose hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(193,80,46,0.3),0_4px_12px_-2px_rgba(193,80,46,0.3)] hover:-translate-y-0.5 disabled:opacity-30 disabled:pointer-events-none disabled:hover:translate-y-0"
                              onClick={() => {
                                setDeleteTarget(u)
                                confirmModal.open()
                              }}
                              aria-label={`Delete ${u.name}`}
                              title={!isEmpty ? 'Change every product using this unit first.' : undefined}
                            >
                              <Icon name="trash" className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {formModal.isOpen && (
        <UnitFormModal isOpen={formModal.isOpen} onClose={formModal.close} onSave={handleSave} unit={activeUnit} />
      )}

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={confirmModal.close}
        onConfirm={handleDelete}
        title="Delete unit?"
        message={`Delete "${deleteTarget?.name}"? This can't be undone.`}
      />
    </div>
  )
}

function UnitFormModal({ isOpen, onClose, onSave, unit }) {
  const [name, setName] = useState(unit?.name || '')
  const [abbreviation, setAbbreviation] = useState(unit?.abbreviation || '')
  const [measurementType, setMeasurementType] = useState(unit?.measurementType || 'COUNT')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // Once any product uses this unit — as its sale unit or its coverage
  // unit — changing the type could break those products, so the backend
  // rejects the change (units.service.js#update). Locked here too, so
  // the form doesn't invite a change the server will just reject.
  const isTypeLocked = Boolean(unit && (unit.productCount > 0 || unit.coverageProductCount > 0))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !abbreviation.trim()) {
      setError('Both name and abbreviation are required.')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      await onSave({ name: name.trim(), abbreviation: abbreviation.trim(), measurementType })
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
        <UnitMeasurementTypeSelect value={measurementType} onChange={setMeasurementType} disabled={isTypeLocked} />
        {isTypeLocked && (
          <p className="text-xs text-ink-muted dark:text-dark-muted -mt-2">
            Locked — this unit is already used by {unit.productCount + unit.coverageProductCount} product(s).
          </p>
        )}
        {error && <p className="text-sm text-rose dark:text-dark-rose">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)] disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : unit ? 'Save Unit' : 'Create Unit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}