
import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import Modal from '../../components/common/Modal'
import EmptyState from '../../components/common/EmptyState'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import StatCard from '../../components/dashboard/StatCard'
import { useDisclosure } from '../../hooks/useDisclosure'
import { warehouseService } from '../../services/warehouseService'
import { transferService } from '../../services/transferService'
import { productService } from '../../services/productService'
import { formatDateTime } from '../../utils/formatters'

/**
 * Warehouses & Transfers — FR: multi-location warehouse management.
 * Locations tab manages the warehouses themselves; Transfers tab moves
 * stock between them (source is decremented, destination incremented, in
 * one atomic step on the backend).
 *
 * Premium pass: the tab switcher now matches the Reports page's underline
 * style with icons, and each tab surfaces a small Dashboard-style stat
 * row (reusing the exact `StatCard` component) — everything derived
 * client-side from data already on the page.
 */
export default function WarehousesPage() {
  const [tab, setTab] = useState('warehouses')

  const TABS = [
    { id: 'warehouses', label: 'Locations', icon: 'inventory' },
    { id: 'transfers', label: 'Stock Transfers', icon: 'suppliers' },
  ]

  return (
    <div>
      <PageHeader title="Warehouses & Transfers" subtitle="Manage store locations and move stock between them." />

      <div className="flex gap-1 border-b border-line mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all duration-200 ${
              tab === t.id ? 'border-amber text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <Icon name={t.icon} className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'warehouses' ? <WarehousesTab /> : <TransfersTab />}
    </div>
  )
}

function WarehousesTab() {
  const [warehouses, setWarehouses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const formModal = useDisclosure()

  async function load() {
    setIsLoading(true)
    try {
      const res = await warehouseService.getAll()
      setWarehouses(res.data.data)
    } catch {
      setError('Could not load warehouses.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(
    () => ({
      count: warehouses.length,
      totalStock: warehouses.reduce((sum, w) => sum + (Number(w.totalStock) || 0), 0),
    }),
    [warehouses],
  )

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await warehouseService.create({ name: name.trim(), address: address.trim() || null })
      setName('')
      setAddress('')
      formModal.close()
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create the warehouse.')
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          type="button"
          className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
          onClick={formModal.open}
        >
          <Icon name="plus" className="h-4 w-4" />
          Add Location
        </button>
      </div>

      {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && warehouses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
          <StatCard label="Total Locations" value={stats.count} icon="suppliers" tone="ink" />
          <StatCard label="Total Stock Across Locations" value={stats.totalStock} icon="inventory" tone="teal" />
        </div>
      )}

      <div className="card card-premium glow-ink">
        {isLoading ? (
          <Loading message="Loading warehouses…" />
        ) : warehouses.length === 0 ? (
          <EmptyState title="No warehouses yet" description="Add your first store location." icon="🏬" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Total Stock</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id} className="group">
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="section-icon rounded-lg bg-ink text-paper">
                          <Icon name="suppliers" className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{w.name}</span>
                      </div>
                    </td>
                    <td className="text-ink-muted">{w.address || '—'}</td>
                    <td className="figure font-medium">{w.totalStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title="Add Location" size="sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label-text" htmlFor="wh-name">
              Name
            </label>
            <input id="wh-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse 2 — Multan Road" required />
          </div>
          <div>
            <label className="label-text" htmlFor="wh-address">
              Address
            </label>
            <textarea id="wh-address" className="input-field" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={formModal.close}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function TransfersTab() {
  const [transfers, setTransfers] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const formModal = useDisclosure()

  const [sourceWarehouseId, setSourceWarehouseId] = useState('')
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)

  async function load() {
    setIsLoading(true)
    try {
      const [transfersRes, warehousesRes, productsRes] = await Promise.all([
        transferService.getAll(),
        warehouseService.getAll(),
        productService.getAll(),
      ])
      setTransfers(transfersRes.data.data)
      setWarehouses(warehousesRes.data.data)
      setProducts(productsRes.data.data)
    } catch {
      setError('Could not load transfers.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setSourceWarehouseId(warehouses[0]?.id || '')
    setDestinationWarehouseId(warehouses[1]?.id || '')
    setProductId(products[0]?.id || '')
    setQuantity(1)
    formModal.open()
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!sourceWarehouseId || !destinationWarehouseId || !productId || !quantity) return
    try {
      await transferService.create({ sourceWarehouseId, destinationWarehouseId, productId, quantity: Number(quantity) })
      formModal.close()
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create the transfer.')
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          type="button"
          className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
          onClick={openCreate}
          disabled={warehouses.length < 2}
        >
          <Icon name="plus" className="h-4 w-4" />
          New Transfer
        </button>
      </div>
      {warehouses.length < 2 && (
        <p className="text-sm text-ink-muted mb-4">Add a second warehouse location before creating transfers.</p>
      )}

      {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && transfers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
          <StatCard label="Total Transfers" value={transfers.length} icon="suppliers" tone="ink" />
          <StatCard
            label="Locations Available"
            value={warehouses.length}
            icon="inventory"
            tone="teal"
          />
        </div>
      )}

      <div className="card card-premium glow-teal">
        {isLoading ? (
          <Loading message="Loading transfers…" />
        ) : transfers.length === 0 ? (
          <EmptyState title="No transfers yet" description="Move stock between warehouse locations here." icon="🚚" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="group">
                    <td className="text-ink-muted">{formatDateTime(t.date)}</td>
                    <td className="font-medium">
                      {t.product}
                      {t.batch && <span className="text-ink-muted text-xs ml-1.5">· {t.batch}</span>}
                    </td>
                    <td>{t.from}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name="chevronDown" className="h-3.5 w-3.5 -rotate-90 text-teal-dark" />
                        {t.to}
                      </span>
                    </td>
                    <td className="figure font-medium">{t.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title="New Stock Transfer" size="sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div>
              <label className="label-text" htmlFor="tr-from">
                From
              </label>
              <select id="tr-from" className="input-field" value={sourceWarehouseId} onChange={(e) => setSourceWarehouseId(e.target.value)}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="h-9 w-9 flex items-center justify-center rounded-full bg-teal-light text-teal-dark shrink-0">
              <Icon name="chevronDown" className="h-4 w-4 -rotate-90" />
            </span>
            <div>
              <label className="label-text" htmlFor="tr-to">
                To
              </label>
              <select id="tr-to" className="input-field" value={destinationWarehouseId} onChange={(e) => setDestinationWarehouseId(e.target.value)}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label-text" htmlFor="tr-product">
              Product
            </label>
            <select id="tr-product" className="input-field" value={productId} onChange={(e) => setProductId(e.target.value)}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text" htmlFor="tr-qty">
              Quantity
            </label>
            <input id="tr-qty" type="number" min="1" className="input-field figure" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={formModal.close}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
            >
              Transfer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
