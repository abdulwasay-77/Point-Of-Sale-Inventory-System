
import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import EmptyState from '../../components/common/EmptyState'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import StatCard from '../../components/dashboard/StatCard'
import { useDisclosure } from '../../hooks/useDisclosure'
import { kitService } from '../../services/kitService'
import { productService } from '../../services/productService'
import { formatCurrency } from '../../utils/formatters'

/**
 * Kits & Bundles — FR: Kitting & Bundling. Sells a multi-part item (e.g. a
 * full toilet set) as a single line at its own price, while the backend
 * automatically deducts each component product from stock individually.
 *
 * Premium pass: a Dashboard-style stat row (reusing the exact `StatCard`
 * component) summarizes the bundle catalog at a glance — all derived
 * client-side from the kits already loaded — plus the same lift + shine +
 * glow treatment on the list card/table, and the builder modal's
 * component rows now lift on hover like the Purchases line items.
 */
export default function KitsPage() {
  const [kits, setKits] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeKit, setActiveKit] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const formModal = useDisclosure()
  const confirmModal = useDisclosure()

  async function loadData() {
    setIsLoading(true)
    try {
      const [kitsRes, productsRes] = await Promise.all([kitService.getAll(), productService.getAll()])
      setKits(kitsRes.data.data)
      setProducts(productsRes.data.data)
    } catch {
      setError('Could not load kits.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const stats = useMemo(() => {
    const count = kits.length
    const sellableNow = kits.filter((k) => k.availableQty > 0).length
    const outOfStock = count - sellableNow
    const avgPrice = count ? kits.reduce((sum, k) => sum + (Number(k.price) || 0), 0) / count : 0
    return { count, sellableNow, outOfStock, avgPrice }
  }, [kits])

  function openCreate() {
    setActiveKit(null)
    formModal.open()
  }

  function openEdit(kit) {
    setActiveKit(kit)
    formModal.open()
  }

  async function handleSave(values) {
    try {
      if (activeKit) {
        await kitService.update(activeKit.id, values)
      } else {
        await kitService.create(values)
      }
      formModal.close()
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the kit.')
    }
  }

  async function handleDelete() {
    try {
      await kitService.remove(deleteTarget.id)
      setDeleteTarget(null)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete the kit.')
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Kits & Bundles"
        subtitle="Sell multi-part sets (e.g. a full toilet set) as one line — components deduct from stock automatically."
        action={
          <button
            type="button"
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
            onClick={openCreate}
          >
            <Icon name="plus" className="h-4 w-4" />
            New Bundle
          </button>
        }
      />

      {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && kits.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Bundles" value={stats.count} icon="products" tone="ink" />
          <StatCard label="Avg. Bundle Price" value={formatCurrency(stats.avgPrice)} icon="chart" tone="teal" />
          <StatCard label="Sellable Now" value={stats.sellableNow} icon="pos" tone="amber" highlight />
          <StatCard label="Out of Stock" value={stats.outOfStock} icon="inventory" tone="rose" />
        </div>
      )}

      <div className="card card-premium glow-amber">
        {isLoading ? (
          <Loading message="Loading bundles…" />
        ) : kits.length === 0 ? (
          <EmptyState
            title="No bundles yet"
            description="Combine multiple products into one sellable package."
            actionLabel="New Bundle"
            onAction={openCreate}
            icon="🎁"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Bundle</th>
                  <th>SKU</th>
                  <th>Components</th>
                  <th>Price</th>
                  <th>Available</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {kits.map((kit) => (
                  <tr key={kit.id} className="group">
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="section-icon rounded-lg bg-amber-light text-amber-dark">
                          <Icon name="products" className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{kit.name}</span>
                      </div>
                    </td>
                    <td className="figure text-ink-muted">{kit.sku}</td>
                    <td className="text-ink-muted text-sm">
                      {kit.components.map((c) => `${c.quantity}× ${c.product}`).join(', ')}
                    </td>
                    <td className="figure">{formatCurrency(kit.price)}</td>
                    <td className="figure">
                      {kit.availableQty > 0 ? (
                        kit.availableQty
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-rose">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose pulse-dot" aria-hidden="true" />
                          0
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink hover:bg-white hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] hover:-translate-y-0.5"
                          onClick={() => openEdit(kit)}
                          aria-label={`Edit ${kit.name}`}
                        >
                          <Icon name="edit" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-rose hover:bg-white hover:shadow-[0_0_0_1px_rgba(193,80,46,0.3),0_4px_12px_-2px_rgba(193,80,46,0.3)] hover:-translate-y-0.5"
                          onClick={() => {
                            setDeleteTarget(kit)
                            confirmModal.open()
                          }}
                          aria-label={`Delete ${kit.name}`}
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

      <KitFormModal isOpen={formModal.isOpen} onClose={formModal.close} onSave={handleSave} initialValues={activeKit} products={products} />

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={confirmModal.close}
        onConfirm={handleDelete}
        title="Delete bundle"
        message={`Delete "${deleteTarget?.name}"? This can't be undone.`}
      />
    </div>
  )
}

function KitFormModal({ isOpen, onClose, onSave, initialValues, products }) {
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [kitPrice, setKitPrice] = useState('')
  const [components, setComponents] = useState([{ productId: '', quantity: 1 }])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName(initialValues?.name || '')
      setSku(initialValues?.sku || '')
      setKitPrice(initialValues?.price ?? '')
      setComponents(
        initialValues?.components?.length
          ? initialValues.components.map((c) => ({ productId: c.productId, quantity: c.quantity }))
          : [{ productId: products[0]?.id || '', quantity: 1 }, { productId: products[1]?.id || '', quantity: 1 }],
      )
    }
  }, [isOpen, initialValues, products])

  function updateComponent(index, field, value) {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }
  function addComponent() {
    setComponents((prev) => [...prev, { productId: products[0]?.id || '', quantity: 1 }])
  }
  function removeComponent(index) {
    setComponents((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const validComponents = components.filter((c) => c.productId && Number(c.quantity) > 0)
    if (!name.trim() || !sku.trim() || !kitPrice || validComponents.length < 2) return

    setIsSaving(true)
    try {
      await onSave({
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        kitPrice: Number(kitPrice),
        components: validComponents.map((c) => ({ productId: c.productId, quantity: Number(c.quantity) })),
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialValues ? 'Edit Bundle' : 'New Bundle'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-text" htmlFor="kit-name">
              Bundle Name
            </label>
            <input id="kit-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full Toilet Set" required />
          </div>
          <div>
            <label className="label-text" htmlFor="kit-sku">
              SKU
            </label>
            <input id="kit-sku" className="input-field figure" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. KIT-0001" required />
          </div>
          <div>
            <label className="label-text" htmlFor="kit-price">
              Bundle Price
            </label>
            <input
              id="kit-price"
              type="number"
              min="0"
              step="0.01"
              className="input-field figure"
              value={kitPrice}
              onChange={(e) => setKitPrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label-text mb-0">Components (at least 2)</label>
            <button
              type="button"
              onClick={addComponent}
              className="btn-ghost text-xs px-2 py-1 transition-all duration-200 hover:text-amber-dark hover:-translate-y-0.5"
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
              Add component
            </button>
          </div>
          <div className="space-y-2">
            {components.map((c, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-2 items-center rounded-lg border border-line p-2 transition-all duration-200 hover:border-amber/50 hover:shadow-[0_4px_14px_-4px_rgba(232,163,61,0.25)]"
              >
                <select
                  className="input-field col-span-8"
                  value={c.productId}
                  onChange={(e) => updateComponent(index, 'productId', e.target.value)}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  className="input-field col-span-3 figure"
                  value={c.quantity}
                  onChange={(e) => updateComponent(index, 'quantity', e.target.value)}
                  placeholder="Qty"
                />
                <button
                  type="button"
                  onClick={() => removeComponent(index)}
                  disabled={components.length <= 2}
                  className="btn-ghost col-span-1 justify-center px-0 py-2 transition-all duration-200 hover:text-rose disabled:opacity-30"
                  aria-label="Remove component"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-line">
          <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
          >
            {isSaving ? 'Saving…' : 'Save Bundle'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
