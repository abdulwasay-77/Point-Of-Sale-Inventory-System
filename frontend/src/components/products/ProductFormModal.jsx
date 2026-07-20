import { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import Icon from '../common/Icon'
import { categoryService } from '../../services/categoryService'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import { usePermissions } from '../../hooks/usePermissions'

/**
 * Create/Edit form for a single product. Builds a FormData payload (so the
 * optional image file can be sent as multipart/form-data) and hands it to
 * the parent's onSave, which calls productService.create/update.
 *
 * Pricing section (wholesale/cost price, GST rate, discount, target
 * margin) is only shown to users with PRICING_MANAGE (Admin by default —
 * see config/permissions.js on the backend, which independently enforces
 * this too; hiding it here is a UX nicety, not the actual security
 * boundary). Everyone with product-edit access still sees the retail
 * Price field, since that's needed to create a product at all.
 */
export default function ProductFormModal({ isOpen, onClose, onSave, initialValues }) {
  const { has } = usePermissions()
  const canManagePricing = has('PRICING_MANAGE')

  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({
    name: '',
    sku: '',
    categoryId: '',
    price: '',
    wholesalePrice: '',
    costPrice: '',
    gstRate: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    targetMarginPct: '',
    stock: '',
    barcode: '',
    baseUom: 'PIECE',
    coveragePerBox: '',
    conversionFactor: '',
    isBatchTracked: false,
  })
  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      categoryService
        .getAll()
        .then((res) => setCategories(res.data.data))
        .catch(() => setCategories([]))
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setForm({
        name: initialValues?.name || '',
        sku: initialValues?.sku || '',
        categoryId: initialValues?.categoryId || '',
        price: initialValues?.price ?? '',
        wholesalePrice: initialValues?.wholesalePrice ?? '',
        costPrice: initialValues?.costPrice ?? '',
        gstRate: initialValues?.gstRate ?? '',
        discountType: initialValues?.discountType || 'PERCENTAGE',
        discountValue: initialValues?.discountValue ?? '',
        targetMarginPct: initialValues?.targetMarginPct ?? '',
        stock: initialValues?.stock ?? '',
        barcode: initialValues?.barcode || '',
        baseUom: initialValues?.baseUom || 'PIECE',
        coveragePerBox: initialValues?.coveragePerBox ?? '',
        conversionFactor: initialValues?.conversionFactor ?? '',
        isBatchTracked: initialValues?.isBatchTracked || false,
      })
      setImagePreview(initialValues?.image ? toImageUrl(initialValues.image) : null)
      setImageFile(null)
      setErrors({})
    }
  }, [isOpen, initialValues])

  // Scanning a barcode while this form is open fills the Barcode field
  // directly — handy for onboarding a new product: scan it once here
  // instead of typing the number off the label. If left blank, the
  // backend auto-generates one from the SKU on save.
  useBarcodeScanner(
    (code) => setForm((prev) => ({ ...prev, barcode: code })),
    { enabled: isOpen },
  )

  // Default the category dropdown to the first loaded category once
  // categories arrive, if nothing is selected yet (create mode).
  useEffect(() => {
    if (isOpen && !form.categoryId && categories.length > 0) {
      setForm((prev) => ({ ...prev, categoryId: categories[0].id }))
    }
  }, [isOpen, categories]) // eslint-disable-line react-hooks/exhaustive-deps

  function toImageUrl(path) {
    if (!path) return null
    if (path.startsWith('http') || path.startsWith('blob:')) return path
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    return `${apiBase.replace(/\/api$/, '')}${path}`
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  function validate() {
    const next = {}
    if (!form.name.trim()) next.name = 'Product name is required.'
    if (!form.sku.trim()) next.sku = 'SKU is required.'
    if (form.price === '' || Number(form.price) < 0) next.price = 'Enter a valid price.'
    if (form.stock === '' || Number(form.stock) < 0) next.stock = 'Enter a valid stock quantity.'
    if (canManagePricing && form.gstRate !== '' && (Number(form.gstRate) < 0 || Number(form.gstRate) > 100)) {
      next.gstRate = 'GST rate must be between 0 and 100.'
    }
    if (canManagePricing && form.discountValue !== '' && Number(form.discountValue) < 0) {
      next.discountValue = 'Discount cannot be negative.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return

    const formData = new FormData()
    formData.append('name', form.name.trim())
    formData.append('sku', form.sku.trim().toUpperCase())
    if (form.categoryId) formData.append('categoryId', form.categoryId)
    formData.append('price', form.price)
    if (form.barcode.trim()) formData.append('barcode', form.barcode.trim())
    formData.append('base_uom', form.baseUom)
    if (form.coveragePerBox !== '') formData.append('coverage_per_box', form.coveragePerBox)
    if (form.conversionFactor !== '') formData.append('conversion_factor', form.conversionFactor)
    formData.append('is_batch_tracked', form.isBatchTracked ? 'true' : 'false')
    formData.append('stock', form.stock)
    if (imageFile) formData.append('image', imageFile)

    // Pricing fields are only sent when this user can actually manage
    // pricing — the backend independently strips them for anyone without
    // PRICING_MANAGE regardless, but there's no reason to send fields the
    // form doesn't even show.
    if (canManagePricing) {
      if (form.wholesalePrice !== '') formData.append('wholesale_price', form.wholesalePrice)
      if (form.costPrice !== '') formData.append('cost_price', form.costPrice)
      if (form.gstRate !== '') formData.append('gst_rate', form.gstRate)
      formData.append('discount_type', form.discountType)
      formData.append('discount_value', form.discountValue === '' ? '0' : form.discountValue)
      formData.append('target_margin_pct', form.targetMarginPct === '' ? '' : form.targetMarginPct)
    }

    setIsSaving(true)
    try {
      await onSave(formData)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialValues ? 'Edit Product' : 'Add Product'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label-text" htmlFor="prod-name">
              Product Name
            </label>
            <input
              id="prod-name"
              className="input-field"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Cola 500ml"
            />
            {errors.name && <p className="text-xs text-rose mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="label-text" htmlFor="prod-sku">
              SKU
            </label>
            <input
              id="prod-sku"
              className="input-field figure"
              value={form.sku}
              onChange={(e) => handleChange('sku', e.target.value)}
              placeholder="e.g. BEV-0001"
            />
            {errors.sku && <p className="text-xs text-rose mt-1">{errors.sku}</p>}
          </div>

          <div>
            <label className="label-text" htmlFor="prod-category">
              Category
            </label>
            <select
              id="prod-category"
              className="input-field"
              value={form.categoryId}
              onChange={(e) => handleChange('categoryId', e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-text" htmlFor="prod-price">
              Price (retail)
            </label>
            <input
              id="prod-price"
              type="number"
              min="0"
              step="0.01"
              className="input-field figure"
              value={form.price}
              onChange={(e) => handleChange('price', e.target.value)}
              placeholder="0.00"
            />
            {errors.price && <p className="text-xs text-rose mt-1">{errors.price}</p>}
          </div>

          <div>
            <label className="label-text" htmlFor="prod-stock">
              Stock Quantity
            </label>
            <input
              id="prod-stock"
              type="number"
              min="0"
              className="input-field figure"
              value={form.stock}
              onChange={(e) => handleChange('stock', e.target.value)}
              placeholder="0"
            />
            {errors.stock && <p className="text-xs text-rose mt-1">{errors.stock}</p>}
          </div>

          {canManagePricing ? (
            <>
              <div className="sm:col-span-2 border-t border-line pt-4 mt-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="section-icon bg-amber-light text-amber-dark">
                    <Icon name="chart" className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                    Pricing, tax &amp; discount
                  </p>
                </div>
              </div>

              <div>
                <label className="label-text" htmlFor="prod-wholesale">
                  Wholesale Price <span className="text-ink-muted font-normal">(contractor/wholesale)</span>
                </label>
                <input
                  id="prod-wholesale"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field figure"
                  value={form.wholesalePrice}
                  onChange={(e) => handleChange('wholesalePrice', e.target.value)}
                  placeholder="defaults to retail if blank"
                />
              </div>

              <div>
                <label className="label-text" htmlFor="prod-cost">
                  Cost Price <span className="text-ink-muted font-normal">(internal only)</span>
                </label>
                <input
                  id="prod-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field figure"
                  value={form.costPrice}
                  onChange={(e) => handleChange('costPrice', e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-ink-muted mt-1">Updates automatically from Purchases going forward.</p>
              </div>

              <div>
                <label className="label-text" htmlFor="prod-gst">
                  GST Rate (%)
                </label>
                <input
                  id="prod-gst"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="input-field figure"
                  value={form.gstRate}
                  onChange={(e) => handleChange('gstRate', e.target.value)}
                  placeholder="e.g. 18"
                />
                {errors.gstRate && <p className="text-xs text-rose mt-1">{errors.gstRate}</p>}
              </div>

              <div>
                <label className="label-text" htmlFor="prod-margin">
                  Target Margin (%) <span className="text-ink-muted font-normal">(optional)</span>
                </label>
                <input
                  id="prod-margin"
                  type="number"
                  min="0"
                  max="99"
                  step="0.5"
                  className="input-field figure"
                  value={form.targetMarginPct}
                  onChange={(e) => handleChange('targetMarginPct', e.target.value)}
                  placeholder="e.g. 30"
                />
                <p className="text-xs text-ink-muted mt-1">% of selling price that should be profit.</p>
              </div>

              <div className="sm:col-span-2">
                <label className="label-text">Standing Discount</label>
                <div className="flex gap-2">
                  <select
                    className="input-field w-40 shrink-0"
                    value={form.discountType}
                    onChange={(e) => handleChange('discountType', e.target.value)}
                    aria-label="Discount type"
                  >
                    <option value="PERCENTAGE">% off</option>
                    <option value="FLAT">Flat off (per unit)</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-field figure flex-1"
                    value={form.discountValue}
                    onChange={(e) => handleChange('discountValue', e.target.value)}
                    placeholder={form.discountType === 'FLAT' ? 'e.g. 50' : 'e.g. 5'}
                    aria-label="Discount value"
                  />
                </div>
                {errors.discountValue && <p className="text-xs text-rose mt-1">{errors.discountValue}</p>}
                <p className="text-xs text-ink-muted mt-1">
                  Applied by default on a POS cart line — overridable per sale.
                </p>
              </div>
            </>
          ) : (
            <div className="sm:col-span-2 rounded-lg bg-paper-dim px-3 py-2.5 text-xs text-ink-muted border-t border-line mt-1">
              GST, wholesale/cost pricing, discount, and margin targets are managed by an admin.
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="label-text" htmlFor="prod-barcode">
              Barcode <span className="text-ink-muted font-normal">(optional — scan, type, or leave blank to auto-generate from SKU)</span>
            </label>
            <div className="relative">
              <Icon name="barcode" className="h-4 w-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="prod-barcode"
                className="input-field figure pl-9"
                value={form.barcode}
                onChange={(e) => handleChange('barcode', e.target.value)}
                placeholder="Scan with a barcode scanner, or leave blank"
              />
            </div>
          </div>

          <div className="sm:col-span-2 border-t border-line pt-4 mt-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="section-icon bg-teal-light text-teal-dark">
                <Icon name="inventory" className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                Unit &amp; batch settings
              </p>
            </div>
          </div>

          <div>
            <label className="label-text" htmlFor="prod-uom">
              Unit of Measure
            </label>
            <select
              id="prod-uom"
              className="input-field"
              value={form.baseUom}
              onChange={(e) => handleChange('baseUom', e.target.value)}
            >
              <option value="PIECE">Piece</option>
              <option value="BOX">Box</option>
              <option value="SQ_FT">Square Feet</option>
              <option value="SQ_M">Square Meter</option>
              <option value="LENGTH">Length</option>
              <option value="BUNDLE">Bundle</option>
            </select>
          </div>

          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2.5 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={form.isBatchTracked}
                onChange={(e) => handleChange('isBatchTracked', e.target.checked)}
                className="rounded border-line text-amber focus:ring-amber"
              />
              Batch/lot tracked (e.g. tiles — shade varies by lot)
            </label>
          </div>

          {form.baseUom === 'BOX' && (
            <div className="sm:col-span-2">
              <label className="label-text" htmlFor="prod-coverage">
                Coverage per Box (sq ft) <span className="text-ink-muted font-normal">— powers the Area calculator in POS</span>
              </label>
              <input
                id="prod-coverage"
                type="number"
                min="0"
                step="0.01"
                className="input-field figure"
                value={form.coveragePerBox}
                onChange={(e) => handleChange('coveragePerBox', e.target.value)}
                placeholder="e.g. 15"
              />
            </div>
          )}

          {(form.baseUom === 'LENGTH' || form.baseUom === 'BUNDLE') && (
            <div className="sm:col-span-2">
              <label className="label-text" htmlFor="prod-conversion">
                Conversion Factor <span className="text-ink-muted font-normal">— base units per {form.baseUom.toLowerCase()}</span>
              </label>
              <input
                id="prod-conversion"
                type="number"
                min="0"
                step="0.01"
                className="input-field figure"
                value={form.conversionFactor}
                onChange={(e) => handleChange('conversionFactor', e.target.value)}
                placeholder="e.g. 10"
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="label-text" htmlFor="prod-image">
              Product Image <span className="text-ink-muted font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-4">
              <div className="upload-zone h-16 w-16 rounded-xl border-2 border-dashed border-line bg-paper-dim flex items-center justify-center overflow-hidden shrink-0">
                {imagePreview ? (
                  <img src={imagePreview} alt="Product preview" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="products" className="h-5 w-5 text-ink-muted" />
                )}
              </div>
              <input
                id="prod-image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="text-sm text-ink-muted file:mr-3 file:btn-outline file:py-1.5 file:px-3 file:text-xs file:transition-all file:duration-200 hover:file:border-amber hover:file:text-amber-dark"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-line mt-2">
          <button
            type="button"
            className="btn-outline transition-all duration-200 hover:-translate-y-0.5"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
          >
            {isSaving ? 'Saving…' : 'Save Product'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
