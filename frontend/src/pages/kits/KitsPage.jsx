import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import EmptyState from '../../components/common/EmptyState'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import StatCard from '../../components/dashboard/StatCard'
import { useDisclosure } from '../../hooks/useDisclosure'
import { usePermissions } from '../../hooks/usePermissions'
import { kitService } from '../../services/kitService'
import { productService } from '../../services/productService'
import { formatCurrency } from '../../utils/formatters'

/**
 * Kits & Bundles — FR: Kitting & Bundling. Sells a multi-part item (e.g. a
 * multi-product bundle) as a single line at its own price, while the backend
 * automatically deducts each component product from stock individually.
 *
 * Premium pass: a Dashboard-style stat row (reusing the exact `StatCard`
 * component) summarizes the bundle catalog at a glance — all derived
 * client-side from the kits already loaded — plus the same lift + shine +
 * glow treatment on the list card/table, and the builder modal's
 * component rows now lift on hover like the Purchases line items.
 */
export default function KitsPage() {
  const { has } = usePermissions()
  const canManage = has('KITS_MANAGE')
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
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    }
  }

  async function handleDelete() {
    try {
      await kitService.remove(deleteTarget.id)
      setDeleteTarget(null)
      await loadData()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
      setDeleteTarget(null)
    }
  }

  return (
    <div data-keyboard-scope>
      <PageHeader
        title="Kits & Bundles"
        subtitle="Sell multi-part sets (e.g. a gift basket or starter kit) as one line — components deduct from stock automatically."
        action={
          canManage && (
            <button
              type="button"
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
              onClick={openCreate}
            >
              <Icon name="plus" className="h-4 w-4" />
              New Bundle
            </button>
          )
        }
      />

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}

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
            actionLabel={canManage ? 'New Bundle' : undefined}
            onAction={canManage ? openCreate : undefined}
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
                        <span className="section-icon rounded-lg bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
                          <Icon name="products" className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{kit.name}</span>
                      </div>
                    </td>
                    <td className="figure text-ink-muted dark:text-dark-muted">{kit.sku}</td>
                    <td className="text-ink-muted dark:text-dark-muted text-sm">
                      {kit.components.map((c) => `${c.quantity}× ${c.product}`).join(', ')}
                    </td>
                    <td className="figure">{formatCurrency(kit.price)}</td>
                    <td className="figure">
                      {kit.availableQty > 0 ? (
                        kit.availableQty
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-rose dark:text-dark-rose">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose dark:bg-dark-rose pulse-dot" aria-hidden="true" />
                          0
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {canManage && (
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink dark:hover:text-dark-text hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] dark:hover:shadow-[0_0_0_1px_rgba(231,229,221,0.12),0_4px_12px_-2px_rgba(0,0,0,0.5)] hover:-translate-y-0.5"
                            onClick={() => openEdit(kit)}
                            aria-label={`Edit ${kit.name}`}
                          >
                            <Icon name="edit" className="h-4 w-4" />
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-rose dark:hover:text-dark-rose hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(193,80,46,0.3),0_4px_12px_-2px_rgba(193,80,46,0.3)] hover:-translate-y-0.5"
                            onClick={() => {
                              setDeleteTarget(kit)
                              confirmModal.open()
                            }}
                            aria-label={`Delete ${kit.name}`}
                          >
                            <Icon name="trash" className="h-4 w-4" />
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
  const [formError, setFormError] = useState('')
  // Bundle Price defaults to the sum of the selected components' retail
  // prices, but is fully editable — bundles are frequently sold at a
  // slight discount to the sum of their parts. `priceTouched` tracks
  // whether the user has typed into the price field themselves; while
  // it's false, the field keeps auto-syncing to the component sum as
  // components/quantities change. The moment they edit the price
  // directly (or we're opening an existing bundle that already has its
  // own price), we stop overwriting it.
  const [priceTouched, setPriceTouched] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setFormError('')
      setName(initialValues?.name || '')
      setSku(initialValues?.sku || '')
      setKitPrice(initialValues?.price ?? '')
      setComponents(
        initialValues?.components?.length
          ? initialValues.components.map((c) => ({ productId: c.productId, quantity: c.quantity }))
          : [{ productId: products[0]?.id || '', quantity: 1 }, { productId: products[1]?.id || '', quantity: 1 }],
      )
      // Editing an existing bundle: it already carries a deliberately-set
      // price, so leave it alone until the user changes something.
      // Creating a new one: start in auto-sum mode.
      setPriceTouched(Boolean(initialValues))
    }
  }, [isOpen, initialValues, products])

  const componentsSum = useMemo(() => {
    return components.reduce((sum, c) => {
      if (!c.productId || !(Number(c.quantity) > 0)) return sum
      const product = products.find((p) => p.id === c.productId)
      return sum + (Number(product?.price) || 0) * Number(c.quantity)
    }, 0)
  }, [components, products])

  // Keep the price field in sync with the component sum until the user
  // steps in and edits it manually.
  useEffect(() => {
    if (!isOpen || priceTouched) return
    setKitPrice(componentsSum > 0 ? componentsSum.toFixed(2) : '')
  }, [componentsSum, isOpen, priceTouched])

  function handlePriceChange(value) {
    setPriceTouched(true)
    setKitPrice(value)
  }

  function resetPriceToSum() {
    setPriceTouched(false)
    setKitPrice(componentsSum > 0 ? componentsSum.toFixed(2) : '')
  }

  function updateComponent(index, field, value) {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }
  function addComponent() {
    // Defaults to the first product not already used by another row —
    // always defaulting to products[0] made it very easy to end up with
    // two rows pointing at the same product (which the backend rejects,
    // a kit can't list the same component twice), especially since a
    // freshly-added row's dropdown looks identical to an existing one
    // until you actually change it.
    setComponents((prev) => {
      const usedIds = new Set(prev.map((c) => c.productId).filter(Boolean))
      const nextDefault = products.find((p) => !usedIds.has(p.id))?.id || ''
      return [...prev, { productId: nextDefault, quantity: 1 }]
    })
  }
  function removeComponent(index) {
    setComponents((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    const validComponents = components.filter((c) => c.productId && Number(c.quantity) > 0)
    if (!name.trim() || !sku.trim() || !kitPrice || validComponents.length < 2) return

    const seenIds = new Set()
    for (const c of validComponents) {
      if (seenIds.has(c.productId)) {
        const dupeName = products.find((p) => p.id === c.productId)?.name || 'That product'
        setFormError(`"${dupeName}" is selected more than once — a bundle can only include each product one time. Adjust the quantity on a single row instead, or remove the duplicate row.`)
        return
      }
      seenIds.add(c.productId)
    }

    setIsSaving(true)
    try {
      await onSave({
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        kitPrice: Number(kitPrice),
        components: validComponents.map((c) => ({ productId: c.productId, quantity: Number(c.quantity) })),
      })
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Could not save this bundle.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialValues ? 'Edit Bundle' : 'New Bundle'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <p className="text-sm rounded-lg px-3 py-2 bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose">
            {formError}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-text" htmlFor="kit-name">
              Bundle Name
            </label>
            <input id="kit-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Starter Bundle" required />
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
              onChange={(e) => handlePriceChange(e.target.value)}
              placeholder="0.00"
              required
            />
            {componentsSum > 0 && (
              <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">
                Sum of component retail prices: <span className="figure">{formatCurrency(componentsSum)}</span>
                {priceTouched && Number(kitPrice) !== componentsSum && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={resetPriceToSum}
                      className="text-amber-dark dark:text-amber hover:underline"
                    >
                      Reset to sum
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label-text mb-0">Components (at least 2)</label>
            <button
              type="button"
              onClick={addComponent}
              className="btn-ghost text-xs px-2 py-1 transition-all duration-200 hover:text-amber-dark dark:hover:text-amber hover:-translate-y-0.5"
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
              Add component
            </button>
          </div>
          <div className="space-y-2">
            {components.map((c, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-2 items-center rounded-lg border border-line dark:border-dark-border p-2 transition-all duration-200 hover:border-amber/50 hover:shadow-[0_4px_14px_-4px_rgba(232,163,61,0.25)]"
              >
                <select
                  className="input-field col-span-8"
                  value={c.productId}
                  onChange={(e) => updateComponent(index, 'productId', e.target.value)}
                >
                  {products.map((p) => {
                    const usedElsewhere = components.some((other, i) => i !== index && other.productId === p.id)
                    return (
                      <option key={p.id} value={p.id} disabled={usedElsewhere}>
                        {p.name}
                        {usedElsewhere ? ' (already in this bundle)' : ''}
                      </option>
                    )
                  })}
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
                  className="btn-ghost col-span-1 justify-center px-0 py-2 transition-all duration-200 hover:text-rose dark:hover:text-dark-rose disabled:opacity-30"
                  aria-label="Remove component"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-line dark:border-dark-border">
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
