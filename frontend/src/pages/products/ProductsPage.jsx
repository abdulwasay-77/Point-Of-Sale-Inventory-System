
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/common/PageHeader'
import SearchInput from '../../components/common/SearchInput'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import EmptyState from '../../components/common/EmptyState'
import Pagination from '../../components/common/Pagination'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import ProductFormModal from '../../components/products/ProductFormModal'
import StockBadge from '../../components/products/StockBadge'
import { useDisclosure } from '../../hooks/useDisclosure'
import { productService } from '../../services/productService'
import { categoryService } from '../../services/categoryService'
import { formatCurrency } from '../../utils/formatters'

const PAGE_SIZE = 6
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api$/, '')

function toImageUrl(path) {
  if (!path) return null
  return path.startsWith('http') ? path : `${API_ORIGIN}${path}`
}

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [activeProduct, setActiveProduct] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const formModal = useDisclosure()
  const confirmModal = useDisclosure()

  async function loadData() {
    setIsLoading(true)
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        productService.getAll(),
        categoryService.getAll(),
      ])
      setProducts(productsRes.data.data)
      setCategories(categoriesRes.data.data)
    } catch {
      setError('Could not load products.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Keep the URL in sync when the search box changes (and vice versa,
  // for links coming in from the navbar's global search).
  useEffect(() => {
    if (query) setSearchParams({ q: query })
    else setSearchParams({})
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesQuery =
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase())
      const matchesCategory = categoryFilter === 'all' || String(p.categoryId) === String(categoryFilter)
      return matchesQuery && matchesCategory
    })
  }, [products, query, categoryFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setActiveProduct(null)
    formModal.open()
  }

  function openEdit(product) {
    setActiveProduct(product)
    formModal.open()
  }

  async function handleSave(formData) {
    try {
      if (activeProduct) {
        await productService.update(activeProduct.id, formData)
      } else {
        await productService.create(formData)
      }
      formModal.close()
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the product.')
    }
  }

  async function handleDelete() {
    try {
      await productService.remove(deleteTarget.id)
      setDeleteTarget(null)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete the product.')
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Manage your catalog — pricing, stock, and categories."
        action={
          <button
            type="button"
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
            onClick={openCreate}
          >
            <Icon name="plus" className="h-4 w-4" />
            Add Product
          </button>
        }
      />

      {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      <div className="card card-premium glow-amber">
        <div className="p-4 border-b border-line flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v)
              setPage(1)
            }}
            placeholder="Search by name or SKU…"
            className="max-w-xs"
          />
          <select
            className="input-field sm:max-w-[200px]"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <Loading message="Loading products…" />
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No products found"
            description="Try a different search or filter, or add a new product."
            actionLabel="Add Product"
            onAction={openCreate}
            icon="📦"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((product) => (
                  <tr key={product.id} className="group">
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-paper-dim border border-line shrink-0 overflow-hidden flex items-center justify-center transition-all duration-300 group-hover:border-amber group-hover:shadow-[0_0_0_1px_rgba(232,163,61,0.4),0_0_10px_1px_rgba(232,163,61,0.25)] group-hover:scale-105">
                          {product.image ? (
                            <img
                              src={toImageUrl(product.image)}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                            />
                          ) : (
                            <Icon name="products" className="h-4 w-4 text-ink-muted" />
                          )}
                        </div>
                        <span className="font-medium transition-colors duration-200 group-hover:text-amber-dark">
                          {product.name}
                        </span>
                      </div>
                    </td>
                    <td className="figure text-ink-muted">{product.sku}</td>
                    <td>{product.category}</td>
                    <td className="figure">{formatCurrency(product.price)}</td>
                    <td>
                      <StockBadge stock={product.stock} />
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink hover:bg-white hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] hover:-translate-y-0.5"
                          onClick={() => openEdit(product)}
                          aria-label={`Edit ${product.name}`}
                        >
                          <Icon name="edit" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-rose hover:bg-white hover:shadow-[0_0_0_1px_rgba(193,80,46,0.3),0_4px_12px_-2px_rgba(193,80,46,0.3)] hover:-translate-y-0.5"
                          onClick={() => {
                            setDeleteTarget(product)
                            confirmModal.open()
                          }}
                          aria-label={`Delete ${product.name}`}
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

      <ProductFormModal
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        onSave={handleSave}
        initialValues={activeProduct}
      />

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={confirmModal.close}
        onConfirm={handleDelete}
        title="Delete product"
        message={`Delete "${deleteTarget?.name}"? This can't be undone.`}
      />
    </div>
  )
}
