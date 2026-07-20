
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
import { categoryService } from '../../services/categoryService'

const PAGE_SIZE = 6

/**
 * Categories — straightforward CRUD module backed by /api/categories.
 * A category can't be deleted while it still has products assigned to it
 * (enforced server-side); the confirm dialog copy reflects that.
 *
 * Premium pass: brought up to parity with the rest of the app — a
 * Dashboard-style stat row (reusing the exact `StatCard` component)
 * summarizes catalog organization at a glance (all derived client-side
 * from the categories already loaded), and empty categories now carry a
 * persistent tinted row wash + a small "Empty" flag, the same "surface
 * a data-quality signal at a glance" treatment Inventory uses for
 * out-of-stock rows — on top of the lift/shine/glow/table-premium
 * system already in place.
 */
export default function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [activeCategory, setActiveCategory] = useState(null) // null = create mode
  const [deleteTarget, setDeleteTarget] = useState(null)

  const formModal = useDisclosure()
  const confirmModal = useDisclosure()

  async function loadCategories() {
    setIsLoading(true)
    try {
      const res = await categoryService.getAll()
      setCategories(res.data.data)
    } catch {
      setError('Could not load categories.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  const stats = useMemo(() => {
    const totalProducts = categories.reduce((sum, c) => sum + (Number(c.productCount) || 0), 0)
    const empty = categories.filter((c) => !c.productCount).length
    const avgPerCategory = categories.length ? totalProducts / categories.length : 0
    return { count: categories.length, totalProducts, avgPerCategory, empty }
  }, [categories])

  const filtered = useMemo(
    () => categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
    [categories, query],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setActiveCategory(null)
    formModal.open()
  }

  function openEdit(category) {
    setActiveCategory(category)
    formModal.open()
  }

  async function handleSave(formValues) {
    try {
      if (activeCategory) {
        await categoryService.update(activeCategory.id, formValues)
      } else {
        await categoryService.create(formValues)
      }
      formModal.close()
      await loadCategories()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the category.')
    }
  }

  async function handleDelete() {
    try {
      await categoryService.remove(deleteTarget.id)
      setDeleteTarget(null)
      await loadCategories()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete the category.')
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Group products so they're easier to find and report on."
        action={
          <button
            type="button"
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
            onClick={openCreate}
          >
            <Icon name="plus" className="h-4 w-4" />
            Add Category
          </button>
        }
      />

      {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Categories" value={stats.count} icon="categories" tone="ink" />
          <StatCard label="Products Categorized" value={stats.totalProducts} icon="products" tone="teal" />
          <StatCard
            label="Avg. Products / Category"
            value={stats.avgPerCategory.toFixed(1)}
            icon="chart"
            tone="amber"
            highlight
          />
          <StatCard label="Empty Categories" value={stats.empty} icon="categories" tone="rose" />
        </div>
      )}

      <div className="card card-premium glow-teal">
        <div className="p-4 border-b border-line">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v)
              setPage(1)
            }}
            placeholder="Search categories…"
            className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <Loading message="Loading categories…" />
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No categories found"
            description="Try a different search, or add your first category."
            actionLabel="Add Category"
            onAction={openCreate}
            icon="🗂️"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Products</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((category) => {
                  const isEmpty = !category.productCount
                  return (
                    <tr key={category.id} className={`group ${isEmpty ? 'bg-rose-light/20' : ''}`}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span
                            className={`section-icon ${
                              isEmpty ? 'bg-rose-light text-rose' : 'bg-teal-light text-teal-dark'
                            }`}
                          >
                            <Icon name="categories" className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-medium transition-colors duration-200 group-hover:text-teal-dark">
                            {category.name}
                          </span>
                          {isEmpty && (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose pulse-dot" aria-hidden="true" />
                              <span className="text-[11px] font-semibold text-rose uppercase tracking-wide">
                                Empty
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-ink-muted">{category.description || '—'}</td>
                      <td>
                        <span className={isEmpty ? 'badge-rose figure' : 'badge-teal figure'}>
                          {category.productCount}
                        </span>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink hover:bg-white hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] hover:-translate-y-0.5"
                            onClick={() => openEdit(category)}
                            aria-label={`Edit ${category.name}`}
                          >
                            <Icon name="edit" className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-rose hover:bg-white hover:shadow-[0_0_0_1px_rgba(193,80,46,0.3),0_4px_12px_-2px_rgba(193,80,46,0.3)] hover:-translate-y-0.5"
                            onClick={() => {
                              setDeleteTarget(category)
                              confirmModal.open()
                            }}
                            aria-label={`Delete ${category.name}`}
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
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

      <CategoryFormModal
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        onSave={handleSave}
        initialValues={activeCategory}
      />

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={confirmModal.close}
        onConfirm={handleDelete}
        title="Delete category"
        message={`Delete "${deleteTarget?.name}"? Categories that still have products can't be deleted.`}
      />
    </div>
  )
}

/** Inline form modal for creating/editing a category. */
function CategoryFormModal({ isOpen, onClose, onSave, initialValues }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Reset the form fields whenever the modal opens with new initial values.
  useEffect(() => {
    setName(initialValues?.name || '')
    setDescription(initialValues?.description || '')
  }, [initialValues, isOpen])

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), description: description.trim() })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialValues ? 'Edit Category' : 'Add Category'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-text" htmlFor="cat-name">
            Name
          </label>
          <input
            id="cat-name"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Beverages"
            required
          />
        </div>
        <div>
          <label className="label-text" htmlFor="cat-desc">
            Description
          </label>
          <textarea
            id="cat-desc"
            className="input-field"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional short description"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
          >
            Save Category
          </button>
        </div>
      </form>
    </Modal>
  )
}
