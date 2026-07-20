
import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import SearchInput from '../../components/common/SearchInput'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import EmptyState from '../../components/common/EmptyState'
import ContactFormModal from '../../components/common/ContactFormModal'
import Pagination from '../../components/common/Pagination'
import Badge from '../../components/common/Badge'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import StatCard from '../../components/dashboard/StatCard'
import { useDisclosure } from '../../hooks/useDisclosure'
import { customerService } from '../../services/customerService'

const PAGE_SIZE = 6

const AVATAR_TONES = [
  'bg-amber-light text-amber-dark',
  'bg-teal-light text-teal-dark',
  'bg-rose-light text-rose',
  'bg-ink text-paper',
]

const TYPE_TONES = {
  RETAIL: 'amber',
  WHOLESALE: 'teal',
  CONTRACTOR: 'rose',
}

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
 * Customers — CRUD module backed by /api/customers. Wholesale/contractor
 * customers automatically get wholesale pricing at POS checkout server-side.
 *
 * Premium pass: brought up to parity with the rest of the app — a
 * Dashboard-style stat row (reusing the exact `StatCard` component)
 * summarizes the customer base at a glance (total, business accounts,
 * retail accounts, and records missing an address, all derived
 * client-side from the customers already loaded), and each row now
 * surfaces the customer's pricing tier as a badge next to their name —
 * the same tone system already used for stock/role badges elsewhere.
 */
export default function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [activeCustomer, setActiveCustomer] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const formModal = useDisclosure()
  const confirmModal = useDisclosure()

  async function loadCustomers() {
    setIsLoading(true)
    try {
      const res = await customerService.getAll()
      setCustomers(res.data.data)
    } catch {
      setError('Could not load customers.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  const stats = useMemo(() => {
    const business = customers.filter((c) => c.customerType && c.customerType !== 'RETAIL').length
    const retail = customers.length - business
    const missingAddress = customers.filter((c) => !c.address).length
    return { total: customers.length, business, retail, missingAddress }
  }, [customers])

  const filtered = useMemo(
    () =>
      customers.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.phone.toLowerCase().includes(query.toLowerCase()),
      ),
    [customers, query],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setActiveCustomer(null)
    formModal.open()
  }

  function openEdit(customer) {
    setActiveCustomer(customer)
    formModal.open()
  }

  async function handleSave(values) {
    try {
      if (activeCustomer) {
        await customerService.update(activeCustomer.id, values)
      } else {
        await customerService.create(values)
      }
      formModal.close()
      await loadCustomers()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the customer.')
    }
  }

  async function handleDelete() {
    try {
      await customerService.remove(deleteTarget.id)
      setDeleteTarget(null)
      await loadCustomers()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete the customer.')
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Keep track of who's buying from you."
        action={
          <button
            type="button"
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
            onClick={openCreate}
          >
            <Icon name="plus" className="h-4 w-4" />
            Add Customer
          </button>
        }
      />

      {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Customers" value={stats.total} icon="customers" tone="ink" />
          <StatCard label="Business Accounts" value={stats.business} icon="suppliers" tone="teal" />
          <StatCard label="Retail Customers" value={stats.retail} icon="pos" tone="amber" highlight />
          <StatCard label="Missing Address" value={stats.missingAddress} icon="customers" tone="rose" />
        </div>
      )}

      <div className="card card-premium glow-ink">
        <div className="p-4 border-b border-line">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v)
              setPage(1)
            }}
            placeholder="Search by name or phone…"
            className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <Loading message="Loading customers…" />
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No customers found"
            description="Try a different search, or add your first customer."
            actionLabel="Add Customer"
            onAction={openCreate}
            icon="🧑‍🤝‍🧑"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((customer) => (
                  <tr key={customer.id} className="group">
                    <td>
                      <div className="flex items-center gap-3">
                        <span
                          className={`section-icon rounded-full font-semibold text-xs ${toneFor(customer.id)}`}
                        >
                          {initialsOf(customer.name)}
                        </span>
                        <span className="font-medium">{customer.name}</span>
                      </div>
                    </td>
                    <td>
                      <Badge tone={TYPE_TONES[customer.customerType] || 'amber'}>
                        {customer.customerType || 'RETAIL'}
                      </Badge>
                    </td>
                    <td className="figure text-ink-muted">{customer.phone}</td>
                    <td className={customer.address ? 'text-ink-muted' : 'text-rose/70 italic'}>
                      {customer.address || 'Not on file'}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink hover:bg-white hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] hover:-translate-y-0.5"
                          onClick={() => openEdit(customer)}
                          aria-label={`Edit ${customer.name}`}
                        >
                          <Icon name="edit" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-rose hover:bg-white hover:shadow-[0_0_0_1px_rgba(193,80,46,0.3),0_4px_12px_-2px_rgba(193,80,46,0.3)] hover:-translate-y-0.5"
                          onClick={() => {
                            setDeleteTarget(customer)
                            confirmModal.open()
                          }}
                          aria-label={`Delete ${customer.name}`}
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

        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <ContactFormModal
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        onSave={handleSave}
        initialValues={activeCustomer}
        title={activeCustomer ? 'Edit Customer' : 'Add Customer'}
        entityLabel="Customer"
      />

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={confirmModal.close}
        onConfirm={handleDelete}
        title="Delete customer"
        message={`Delete "${deleteTarget?.name}"? This can't be undone.`}
      />
    </div>
  )
}
