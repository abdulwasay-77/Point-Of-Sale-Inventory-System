
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
import { variationService } from '../../services/variationService'

const PAGE_SIZE = 6

/**
 * Variations — reusable variation TYPES (Color, Diameter, ...), each with
 * its own list of values (Red, Blue, ... / 2, 4, 6 ...), defined once and
 * independent of any single product — the same role Categories already
 * plays. Picked from a dropdown on the Add Product screen; never created
 * from there. Mirrors CategoriesPage.jsx's structure.
 *
 * A variation can't be deleted while it still has products attached to
 * it (enforced server-side); the confirm dialog copy reflects that. A
 * value that's already used by a product variant is deactivated rather
 * than deleted, so past sales/stock history stays intact — also
 * enforced server-side.
 */
export default function VariationsPage() {
  const { has } = usePermissions()
  const canManage = has('VARIATIONS_MANAGE')
  const [variations, setVariations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [activeVariation, setActiveVariation] = useState(null) // null = create mode
  const [deleteTarget, setDeleteTarget] = useState(null)

  const formModal = useDisclosure()
  const confirmModal = useDisclosure()

  async function loadVariations() {
    setIsLoading(true)
    try {
      const res = await variationService.getAll()
      setVariations(res.data.data)
    } catch {
      setError('Could not load variations.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadVariations()
  }, [])

  const stats = useMemo(() => {
    const totalProducts = variations.reduce((sum, v) => sum + (Number(v.productCount) || 0), 0)
    const totalValues = variations.reduce((sum, v) => sum + (v.values?.length || 0), 0)
    const empty = variations.filter((v) => !v.productCount).length
    return { count: variations.length, totalProducts, totalValues, empty }
  }, [variations])

  const filtered = useMemo(
    () => variations.filter((v) => v.name.toLowerCase().includes(query.toLowerCase())),
    [variations, query],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setActiveVariation(null)
    formModal.open()
  }

  function openEdit(variation) {
    setActiveVariation(variation)
    formModal.open()
  }

  async function handleClose() {
    formModal.close()
    await loadVariations()
  }

  async function handleDelete() {
    try {
      await variationService.remove(deleteTarget.id)
      setDeleteTarget(null)
      await loadVariations()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
      setDeleteTarget(null)
    }
  }

  return (
    <div data-keyboard-scope>
      <PageHeader
        title="Variations"
        subtitle="Define reusable variation types — Color, Diameter, Length — once, then attach them to any product."
        action={
          canManage && (
            <button
              type="button"
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
              onClick={openCreate}
            >
              <Icon name="plus" className="h-4 w-4" />
              Add Variation
            </button>
          )
        }
      />

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Variations" value={stats.count} icon="categories" tone="ink" />
          <StatCard label="Total Values" value={stats.totalValues} icon="products" tone="teal" />
          <StatCard label="Products Using Variations" value={stats.totalProducts} icon="chart" tone="amber" highlight />
          <StatCard label="Unused Variations" value={stats.empty} icon="categories" tone="rose" />
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
            placeholder="Search variations…"
            className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <Loading message="Loading variations…" />
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No variations found"
            description="Try a different search, or add your first variation — e.g. Color, Diameter, or Length."
            actionLabel={canManage ? 'Add Variation' : undefined}
            onAction={canManage ? openCreate : undefined}
            icon="🏷️"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Values</th>
                  <th>Products</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((variation) => {
                  const isEmpty = !variation.productCount
                  return (
                    <tr key={variation.id} className={`group ${isEmpty ? 'bg-rose-light/20 dark:bg-dark-rose/15' : ''}`}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span
                            className={`section-icon ${
                              isEmpty ? 'bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose' : 'bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal'
                            }`}
                          >
                            <Icon name="categories" className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-medium transition-colors duration-200 group-hover:text-teal-dark dark:group-hover:text-dark-teal">
                            {variation.name}
                          </span>
                        </div>
                      </td>
                      <td className="text-ink-muted dark:text-dark-muted">
                        {variation.valueType === 'MEASUREMENT' ? `Measurement (${variation.unit || 'no unit'})` : 'Text'}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(variation.values || []).slice(0, 4).map((v) => (
                            <span key={v.id} className="badge-teal text-xs">
                              {v.value}
                              {variation.valueType === 'MEASUREMENT' && variation.unit ? ` ${variation.unit}` : ''}
                            </span>
                          ))}
                          {(variation.values || []).length > 4 && (
                            <span className="text-xs text-ink-muted dark:text-dark-muted">+{variation.values.length - 4} more</span>
                          )}
                          {(variation.values || []).length === 0 && <span className="text-xs text-ink-muted dark:text-dark-muted">—</span>}
                        </div>
                      </td>
                      <td>
                        <span className={isEmpty ? 'badge-rose figure' : 'badge-teal figure'}>{variation.productCount}</span>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {canManage && (
                            <button
                              type="button"
                              className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink dark:hover:text-dark-text hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] dark:hover:shadow-[0_0_0_1px_rgba(231,229,221,0.12),0_4px_12px_-2px_rgba(0,0,0,0.5)] hover:-translate-y-0.5"
                              onClick={() => openEdit(variation)}
                              aria-label={`Edit ${variation.name}`}
                            >
                              <Icon name="edit" className="h-4 w-4" />
                            </button>
                          )}
                          {canManage && (
                            <button
                              type="button"
                              className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-rose dark:hover:text-dark-rose hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(193,80,46,0.3),0_4px_12px_-2px_rgba(193,80,46,0.3)] hover:-translate-y-0.5"
                              onClick={() => {
                                setDeleteTarget(variation)
                                confirmModal.open()
                              }}
                              aria-label={`Delete ${variation.name}`}
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

      <VariationFormModal isOpen={formModal.isOpen} onClose={handleClose} initialValues={activeVariation} />

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={confirmModal.close}
        onConfirm={handleDelete}
        title="Delete variation"
        message={`Delete "${deleteTarget?.name}"? Variations that are still attached to products can't be deleted.`}
      />
    </div>
  )
}

/**
 * Inline form modal for creating/editing a variation, plus managing its
 * values in the same place.
 *
 * Create mode: values are drafted locally and sent together with the
 * variation itself in one request (nothing exists on the server until
 * Save Variation is clicked).
 *
 * Edit mode: the variation already has an id, so each value change
 * (add/edit/deactivate) is its own live API call — reflected immediately,
 * same as VariantManager does for a product's variants.
 */
function VariationFormModal({ isOpen, onClose, initialValues }) {
  const [name, setName] = useState('')
  const [valueType, setValueType] = useState('TEXT')
  const [unit, setUnit] = useState('')
  const [values, setValues] = useState([]) // create mode: draft list
  const [draftValue, setDraftValue] = useState('')
  const [draftPrice, setDraftPrice] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const isEdit = Boolean(initialValues?.id)

  useEffect(() => {
    if (isOpen) {
      setName(initialValues?.name || '')
      setValueType(initialValues?.valueType || 'TEXT')
      setUnit(initialValues?.unit || '')
      setValues(initialValues?.values || [])
      setDraftValue('')
      setDraftPrice('')
      setError('')
    }
  }, [isOpen, initialValues])

  function addDraftValue() {
    if (!draftValue.trim()) {
      setError('Enter a value first.')
      return
    }
    setError('')
    const entry = {
      tempId: `${Date.now()}-${Math.random()}`,
      value: draftValue.trim(),
      priceAdjustment: draftPrice === '' ? 0 : Number(draftPrice),
    }
    if (isEdit) {
      // Live: add it to the server immediately.
      variationService
        .addValue(initialValues.id, entry)
        .then((res) => setValues((prev) => [...prev, res.data.data]))
        .catch(() => {}) // Could not add value. -- handled by the global error popup
    } else {
      setValues((prev) => [...prev, entry])
    }
    setDraftValue('')
    setDraftPrice('')
  }

  function removeDraftValue(v) {
    if (isEdit && v.id) {
      variationService
        .removeValue(initialValues.id, v.id)
        .then(() => setValues((prev) => prev.filter((x) => x.id !== v.id)))
        .catch(() => {}) // Could not remove value. -- handled by the global error popup
    } else {
      setValues((prev) => prev.filter((x) => x.tempId !== v.tempId))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Variation name is required.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      if (isEdit) {
        // Values were already saved live above — just save the
        // variation's own fields here.
        await variationService.update(initialValues.id, { name: name.trim(), valueType, unit: unit || null })
      } else {
        if (values.length === 0) {
          setError('Add at least one value before saving.')
          setIsSaving(false)
          return
        }
        await variationService.create({
          name: name.trim(),
          valueType,
          unit: unit || null,
          values: values.map(({ value, priceAdjustment }) => ({ value, priceAdjustment })),
        })
      }
      onClose()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Variation' : 'Add Variation'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text" htmlFor="var-name">
              Variation name
            </label>
            <input
              id="var-name"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Color"
              required
            />
          </div>
          <div>
            <label className="label-text" htmlFor="var-type">
              Value type
            </label>
            <select id="var-type" className="input-field" value={valueType} onChange={(e) => setValueType(e.target.value)}>
              <option value="TEXT">Text (e.g. Color, Finish)</option>
              <option value="MEASUREMENT">Measurement (e.g. Diameter, Length)</option>
            </select>
          </div>
        </div>

        {valueType === 'MEASUREMENT' && (
          <div>
            <label className="label-text" htmlFor="var-unit">
              Unit
            </label>
            <input
              id="var-unit"
              className="input-field"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. inch, ft, L"
            />
          </div>
        )}

        <div className="rounded-lg border border-line dark:border-dark-border p-3">
          <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide mb-2">Values</p>

          {values.length > 0 && (
            <ul className="divide-y divide-line/70 dark:divide-dark-border/70 mb-3">
              {values.map((v) => (
                <li key={v.id || v.tempId} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-ink dark:text-dark-text">
                    {v.value}
                    {valueType === 'MEASUREMENT' && unit ? ` ${unit}` : ''}
                    {Number(v.priceAdjustment) !== 0 && (
                      <span className="text-xs text-ink-muted dark:text-dark-muted ml-2">
                        {v.priceAdjustment > 0 ? '+' : ''}
                        {v.priceAdjustment}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDraftValue(v)}
                    className="p-1.5 rounded-lg text-ink-muted dark:text-dark-muted transition-colors duration-150 hover:bg-rose dark:hover:bg-dark-rose hover:text-white shrink-0"
                    aria-label={`Remove ${v.value}`}
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="bg-paper-dim dark:bg-dark-card2 rounded-lg p-2.5 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input-field !py-1.5 text-sm"
                placeholder={valueType === 'MEASUREMENT' ? 'Value (e.g. 6)' : 'Value (e.g. Red)'}
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
              />
              <input
                type="number"
                step="0.01"
                className="input-field figure !py-1.5 text-sm"
                placeholder="Price add-on (default 0)"
                value={draftPrice}
                onChange={(e) => setDraftPrice(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={addDraftValue} className="btn-accent !py-1.5 !px-3 text-xs">
                Add Value
              </button>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-rose dark:text-dark-rose">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
            {isEdit ? 'Done' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)] disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : isEdit ? 'Save Variation' : 'Create Variation'}
          </button>
        </div>
      </form>
    </Modal>
  )
}


