import { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import Icon from '../common/Icon'
import { categoryService } from '../../services/categoryService'
import { variationService } from '../../services/variationService'
import { unitService } from '../../services/unitService'
import { warehouseService } from '../../services/warehouseService'
import { settingsService } from '../../services/settingsService'
import { productService } from '../../services/productService'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import { usePermissions } from '../../hooks/usePermissions'
import VariantManager from './VariantManager'
import VariantValuePicker from './VariantValuePicker'
import BatchManager from './BatchManager'
import AreaCoverageFields from './AreaCoverageFields'

/**
 * Create/Edit form for a single product. Builds a FormData payload (so the
 * optional image file can be sent as multipart/form-data) and hands it to
 * the parent's onSave, which calls productService.create/update.
 *
 * Pricing section (wholesale/cost price, tax rate, discount, target
 * margin) is only shown to users with PRICING_MANAGE (Admin by default —
 * see config/permissions.js on the backend, which independently enforces
 * this too; hiding it here is a UX nicety, not the actual security
 * boundary). Everyone with product-edit access still sees the retail
 * Price field, since that's needed to create a product at all.
 *
 * Retail/wholesale price auto-fill from cost + target margin, same
 * formula as the Purchases page's suggestion ("margin" = markup on cost,
 * price = cost * (1 + margin/100)). It writes straight into the Price/
 * Wholesale fields — not a separate "suggested, click to apply" banner —
 * but the moment you type into either field yourself, that field stops
 * auto-following; changing cost or margin again won't overwrite a value
 * you've deliberately chosen. Both fields stay fully editable always.
 *
 * Barcode is a distinct generated code (not the SKU) — see the Generate
 * button next to that field, gated behind BARCODES_MANAGE (Admin only).
 *
 * Variations: a product can attach MULTIPLE Variations at once (e.g. both
 * Color and Size) — each defined once, independently, on the Variations
 * page (VariationsPage.jsx) and picked from checkboxes here, the same way
 * Category already works from a dropdown. Nothing about a Variation's
 * name or values is ever created from this form. Picking more than one
 * axis is what makes a real "Red, Medium" combined variant possible — see
 * VariantValuePicker (new products) / VariantManager (existing ones).
 */
export default function ProductFormModal({ isOpen, onClose, onSave, initialValues }) {
  const { has } = usePermissions()
  const canManagePricing = has('PRICING_MANAGE')
  const canManageBarcodes = has('BARCODES_MANAGE')

  const [categories, setCategories] = useState([])
  const [variations, setVariations] = useState([])
  const [units, setUnits] = useState([])
  const [warehouses, setWarehouses] = useState([])
  // Settings → Sales Defaults → Default Tax Rate — pre-fills tax rate for
  // a brand-new product (see the effects below); an existing product
  // keeps whatever rate it was actually saved with, never silently
  // overwritten by a later change to the business-wide default.
  const [defaultTaxRate, setDefaultTaxRate] = useState(null)
  const [form, setForm] = useState({
    name: '',
    sku: '',
    categoryId: '',
    price: '',
    wholesalePrice: '',
    costPrice: '',
    taxRate: '',
    taxCode: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    targetMarginPct: '',
    stock: '',
    barcode: '',
    baseUomId: '',
    warehouseId: '',
    coverageQuantity: '',
    coverageUomId: '',
    isBatchTracked: false,
    variationIds: [],
    length: '',
    width: '',
    dimensionUnit: 'ft',
  })
  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingBarcode, setIsGeneratingBarcode] = useState(false)
  // Once true, cost/margin changes stop auto-filling that field — the
  // admin has taken over. Reset whenever the form re-opens (see the
  // isOpen effect below).
  const [priceTouched, setPriceTouched] = useState(false)
  const [wholesaleTouched, setWholesaleTouched] = useState(false)
  // Area-coverage tracking — optional, generic (works for any product
  // whose sale unit covers an area, e.g. tile cartons, paint tins). Used
  // to be shown only when a fixed enum's Unit of Measure equalled
  // "BOX"/"LENGTH"/"BUNDLE"; now that units are a free-form business-
  // managed list with an explicit measurementType, this is its own
  // opt-in toggle instead, independent of which sale unit is picked. See
  // AreaCoverageFields.jsx for the two fields it reveals.
  const [enableCoverageTracking, setEnableCoverageTracking] = useState(false)
  // Combinations picked for a brand-new product — see
  // VariantValuePicker. An ARRAY of { valueIds: [...], sku, stock,
  // priceOverride }, one entry per real stocked combination (e.g. "Red,
  // Medium"). Irrelevant once editing an existing product (that uses
  // VariantManager, which talks to the API directly instead).
  const [picks, setPicks] = useState([])
  // Bumped by VariantManager (the Color/Size Combinations panel)
  // whenever its variant list changes, so the sibling BatchManager panel
  // below it knows to refetch its own "Select a value…" dropdown instead
  // of holding a stale list from whenever it last mounted.
  const [variantsRefreshToken, setVariantsRefreshToken] = useState(0)

  useEffect(() => {
    if (isOpen) {
      categoryService
        .getAll()
        .then((res) => setCategories(res.data.data))
        .catch(() => setCategories([]))
      variationService
        .getAll()
        .then((res) => setVariations(res.data.data))
        .catch(() => setVariations([]))
      unitService
        .getAll()
        .then((res) => setUnits(res.data.data))
        .catch(() => setUnits([]))
      warehouseService
        .getAll()
        .then((res) => setWarehouses(res.data.data))
        .catch(() => setWarehouses([]))
      settingsService
        .get()
        .then((res) => setDefaultTaxRate(res.data.data.defaultTaxRate))
        .catch(() => setDefaultTaxRate(null))
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
        // New product: starts blank, then a separate effect below fills
        // it from Settings once that loads — kept out of this reset so
        // an in-progress async fetch can never wipe other fields the
        // admin has already started typing. Existing product: always
        // its own saved rate, never overridden.
        taxRate: initialValues?.taxRate ?? '',
        taxCode: initialValues?.taxCode || '',
        discountType: initialValues?.discountType || 'PERCENTAGE',
        discountValue: initialValues?.discountValue ?? '',
        targetMarginPct: initialValues?.targetMarginPct ?? '',
        stock: initialValues?.stock ?? '',
        barcode: initialValues?.barcode || '',
        baseUomId: initialValues?.baseUomId || '',
        warehouseId: '',
        coverageQuantity: initialValues?.coverageQuantity ?? '',
        coverageUomId: initialValues?.coverageUomId || '',
        isBatchTracked: initialValues?.isBatchTracked || false,
        variationIds: initialValues?.variationIds || [],
        length: initialValues?.length ?? '',
        width: initialValues?.width ?? '',
        dimensionUnit: initialValues?.dimensionUnit || 'ft',
      })
      setEnableCoverageTracking(
        Boolean(initialValues?.coverageQuantity && initialValues?.coverageUomId),
      )
      setImagePreview(initialValues?.image ? toImageUrl(initialValues.image) : null)
      setImageFile(null)
      setErrors({})
      // Editing an existing product: its price was already a deliberate
      // choice, so don't auto-overwrite it just because cost/margin
      // happen to be filled in already. Only a brand new product starts
      // "untouched", so the very first cost+margin entry can auto-fill.
      setPriceTouched(Boolean(initialValues))
      setWholesaleTouched(Boolean(initialValues))
      setPicks([])
    }
  }, [isOpen, initialValues])

  // Fills tax rate from Settings once it's loaded — separate from the
  // form reset above on purpose, so a slow settings fetch can never wipe
  // out fields the admin already started typing. Only touches taxRate,
  // and only while it's still untouched (blank) on a brand-new product.
  useEffect(() => {
    if (isOpen && !initialValues && defaultTaxRate !== null) {
      setForm((prev) => (prev.taxRate === '' ? { ...prev, taxRate: String(defaultTaxRate) } : prev))
    }
  }, [isOpen, initialValues, defaultTaxRate])

  // Default the unit-of-measure dropdown to the first loaded unit, if
  // nothing is selected yet (create mode) — same pattern as the category
  // default-fill below.
  useEffect(() => {
    if (isOpen && !form.baseUomId && units.length > 0) {
      setForm((prev) => (prev.baseUomId ? prev : { ...prev, baseUomId: units[0].id }))
    }
  }, [isOpen, units]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scanning a barcode while this form is open fills the Barcode field
  // directly — handy for onboarding a new product that already has a
  // manufacturer barcode: scan it once here instead of typing the number
  // off the label.
  useBarcodeScanner(
    (code) => setForm((prev) => ({ ...prev, barcode: code })),
    { enabled: isOpen },
  )

  /** Generates a distinct, unique barcode (not the SKU). For an existing
   *  product this calls the backend so it's saved immediately, without
   *  waiting for "Save Product" — handy since the Barcode Labels page can
   *  then print it right away. For a brand new product (no id yet), a
   *  temporary code is filled in locally and only actually saved once the
   *  form itself is submitted. */
  async function handleGenerateBarcode() {
    if (initialValues?.id) {
      setIsGeneratingBarcode(true)
      try {
        const res = await productService.generateBarcode(initialValues.id)
        setForm((prev) => ({ ...prev, barcode: res.data.data.barcode }))
      } catch {
        setErrors((prev) => ({ ...prev, barcode: 'Could not generate a barcode. Try again.' }))
      } finally {
        setIsGeneratingBarcode(false)
      }
    } else {
      let code = ''
      for (let i = 0; i < 12; i += 1) code += Math.floor(Math.random() * 10)
      setForm((prev) => ({ ...prev, barcode: code }))
    }
  }

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
    if (field === 'price') setPriceTouched(true)
    if (field === 'wholesalePrice') setWholesaleTouched(true)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // Auto-fill retail/wholesale price from cost + target margin — same
  // formula as the Purchases page's suggested price ("margin" = markup on
  // cost, so price = cost * (1 + margin/100)).
  // Only fills a field the admin hasn't manually edited yet this session.
  useEffect(() => {
    if (!canManagePricing) return
    const cost = Number(form.costPrice)
    const margin = Number(form.targetMarginPct)
    if (!form.costPrice || !form.targetMarginPct || margin <= 0) return

    const suggested = Math.round((cost * (1 + margin / 100)) * 100) / 100
    setForm((prev) => {
      const next = { ...prev }
      if (!priceTouched) next.price = String(suggested)
      if (!wholesaleTouched) next.wholesalePrice = String(suggested)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.costPrice, form.targetMarginPct, priceTouched, wholesaleTouched, canManagePricing])

  function handleImageChange(e) {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  // True only once the product *actually* has Variations attached in the
  // database (not just selected in this session) — this is what gates
  // whether Stock Quantity is still a real, editable field vs. read-only,
  // and whether combinations can be managed live via the API yet. See the
  // render block below and the VariantManager/VariantValuePicker split.
  const isSavedVariantProduct = Boolean(initialValues?.id && initialValues?.variationIds?.length > 0)
  const isNewVariantProduct = form.variationIds.length > 0 && !initialValues?.id

  // Same idea as the Variation gating above, but for Batch tracking: a
  // batch-tracked product's stock must always come in through a specific
  // batch, and this form has no
  // batch-number field at all. So Stock Quantity is never a free-typed
  // number here once "Batch/lot tracked" is on — either it already has
  // real batches (an existing batch-tracked product, shown read-only) or
  // it doesn't yet (locked to 0, with a pointer to Purchases). The
  // backend enforces this too (see products.service.js#create/#update);
  // this is just so the form doesn't let someone type a number the
  // server will then reject or silently ignore.
  const isSavedBatchProduct = Boolean(initialValues?.id && initialValues?.isBatchTracked)
  const isTurningOnBatchTracking = form.isBatchTracked && !initialValues?.isBatchTracked

  function validate() {
    const next = {}
    if (!form.name.trim()) next.name = 'Product name is required.'
    if (!form.sku.trim()) next.sku = 'SKU is required.'
    if (form.price === '' || Number(form.price) < 0) next.price = 'Enter a valid price.'

    // Stock Quantity only means something as a plain number for a
    // non-variant product, or a brand-new one with a Variation attached
    // (where it's the target the picked values must add up to — checked
    // below). For an *already-saved* variant product it's purely
    // informational (computed from its values) and isn't submitted, so
    // it's not validated here.
    if (!isSavedVariantProduct) {
      if (form.stock === '' || Number(form.stock) < 0) next.stock = 'Enter a valid stock quantity.'
    }
    if (isNewVariantProduct && form.stock !== '' && Number(form.stock) >= 0) {
      const allocated = picks.reduce((sum, p) => sum + Number(p.stock || 0), 0)
      if (picks.length === 0) {
        next.variants = 'Add at least one combination — each unit of stock needs to belong to one.'
      } else if (picks.some((p) => !p.sku.trim())) {
        next.variants = 'Every added combination needs its own SKU.'
      } else if (allocated !== Number(form.stock)) {
        next.variants = `Stock Quantity (${form.stock}) must exactly match the total stock across all added combinations (currently ${allocated}).`
      }
    }

    if (canManagePricing && form.taxRate !== '' && (Number(form.taxRate) < 0 || Number(form.taxRate) > 100)) {
      next.taxRate = 'Tax rate must be between 0 and 100.'
    }
    if (canManagePricing && form.discountValue !== '' && Number(form.discountValue) < 0) {
      next.discountValue = 'Discount cannot be negative.'
    }
    if (enableCoverageTracking) {
      if (form.coverageQuantity === '' || Number(form.coverageQuantity) <= 0) {
        next.coverageQuantity = 'Enter a positive coverage quantity.'
      }
      if (!form.coverageUomId) {
        next.coverageUomId = 'Select an area unit.'
      }
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
    formData.append('base_uom_id', form.baseUomId)
    // When the "covers an area" toggle is on, send both coverage values
    // (validated together server-side). When it's off, send explicit
    // empty strings — not simply omit the fields — so an existing
    // product's saved coverage is actually cleared on update rather than
    // left untouched (see products.service.js#update, which only
    // re-validates/clears coverage when at least one of these keys is
    // present in the request at all).
    if (enableCoverageTracking) {
      formData.append('coverage_quantity', form.coverageQuantity)
      formData.append('coverage_uom_id', form.coverageUomId)
    } else if (initialValues?.id) {
      formData.append('coverage_quantity', '')
      formData.append('coverage_uom_id', '')
    }
    formData.append('is_batch_tracked', form.isBatchTracked ? 'true' : 'false')
    formData.append('variationIds', JSON.stringify(form.variationIds))
    if (form.warehouseId) formData.append('warehouseId', form.warehouseId)
    if (form.length !== '') formData.append('length', form.length)
    if (form.width !== '') formData.append('width', form.width)
    if (form.length !== '' || form.width !== '') formData.append('dimension_unit', form.dimensionUnit)

    // For an already-saved variant product, Stock Quantity is purely
    // informational (see validate()) — every real unit lives on a picked
    // combination, managed below via VariantManager, not this field — so
    // it's left out of the request entirely rather than sent as a number
    // the backend would just ignore. (An existing product where
    // Variations were *just* picked this session still needs to send
    // `stock` — the backend requires it to be 0 before the attachment
    // itself can be saved.)
    if (!isSavedVariantProduct) {
      formData.append('stock', form.stock)
    }
    // Brand-new product with Variations attached: hand off the added
    // combinations so the product and every combination are created
    // together in one request — see VariantValuePicker and
    // products.service.js#create.
    if (isNewVariantProduct) {
      const variantsPayload = picks.map((p) => ({
        variationValueIds: p.valueIds,
        sku: p.sku,
        stock: p.stock,
        priceOverride: p.priceOverride,
      }))
      formData.append('variants', JSON.stringify(variantsPayload))
    }
    if (imageFile) formData.append('image', imageFile)

    // Pricing fields are only sent when this user can actually manage
    // pricing — the backend independently strips them for anyone without
    // PRICING_MANAGE regardless, but there's no reason to send fields the
    // form doesn't even show.
    if (canManagePricing) {
      if (form.wholesalePrice !== '') formData.append('wholesale_price', form.wholesalePrice)
      if (form.costPrice !== '') formData.append('cost_price', form.costPrice)
      if (form.taxRate !== '') formData.append('tax_rate', form.taxRate)
      if (form.taxCode.trim()) formData.append('tax_code', form.taxCode.trim())
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
            {errors.name && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.name}</p>}
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
            {errors.sku && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.sku}</p>}
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
            {errors.price && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.price}</p>}
          </div>

          <div>
            <label className="label-text" htmlFor="prod-stock">
              Stock Quantity
            </label>
            {isSavedVariantProduct ? (
              // Already has a Variation attached in the database: every
              // unit lives on a picked value now (see the panel below) —
              // this field isn't sent to the server at all, so it's shown
              // read-only rather than implying it can still be edited here.
              <>
                <input
                  id="prod-stock"
                  className="input-field figure bg-paper-dim dark:bg-dark-card2 text-ink-muted dark:text-dark-muted"
                  value={`${form.stock} (total across all values)`}
                  disabled
                  readOnly
                />
              </>
            ) : isSavedBatchProduct ? (
              // Already batch-tracked in the database: every real unit of
              // stock belongs to a specific Batch — added below via the
              // Batches panel (or via Purchases) — not this field. Shown
              // read-only for the same reason as the variant case above.
              <>
                <input
                  id="prod-stock"
                  className="input-field figure bg-paper-dim dark:bg-dark-card2 text-ink-muted dark:text-dark-muted"
                  value={`${form.stock} (across all batches)`}
                  disabled
                  readOnly
                />
              </>
            ) : isTurningOnBatchTracking ? (
              // Batch tracking was just switched on this session (new
              // product, or an existing one that wasn't batch-tracked
              // before). There's no batch-number field on this form, so
              // stock can't be entered here — it has to come in with a
              // batch number afterward.
              <>
                <input
                  id="prod-stock"
                  className="input-field figure bg-paper-dim dark:bg-dark-card2 text-ink-muted dark:text-dark-muted"
                  value="0 (add a batch after saving)"
                  disabled
                  readOnly
                />
              </>
            ) : (
              <input
                id="prod-stock"
                type="number"
                min="0"
                className="input-field figure"
                value={form.stock}
                onChange={(e) => handleChange('stock', e.target.value)}
                placeholder="0"
              />
            )}
            {errors.stock && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.stock}</p>}
          </div>

          {!isSavedVariantProduct && !isSavedBatchProduct && !isTurningOnBatchTracking && warehouses.length > 1 && (
            <div>
              <label className="label-text" htmlFor="prod-warehouse">
                Warehouse <span className="text-ink-muted dark:text-dark-muted font-normal">— where this stock goes</span>
              </label>
              <select
                id="prod-warehouse"
                className="input-field"
                value={form.warehouseId}
                onChange={(e) => handleChange('warehouseId', e.target.value)}
              >
                <option value="">Main warehouse (default)</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {canManagePricing ? (
            <>
              <div className="sm:col-span-2 border-t border-line dark:border-dark-border pt-4 mt-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="section-icon bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
                    <Icon name="chart" className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">
                    Pricing, tax &amp; discount
                  </p>
                </div>
              </div>

              <div>
                <label className="label-text" htmlFor="prod-wholesale">
                  Wholesale Price
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
                  Cost Price <span className="text-ink-muted dark:text-dark-muted font-normal">(internal only)</span>
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
              </div>

              <div>
                <label className="label-text" htmlFor="prod-tax-rate">
                  Tax Rate (%)
                </label>
                <input
                  id="prod-tax-rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="input-field figure"
                  value={form.taxRate}
                  onChange={(e) => handleChange('taxRate', e.target.value)}
                  placeholder="e.g. 18"
                />
                {errors.taxRate && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.taxRate}</p>}
              </div>

              <div>
                <label className="label-text" htmlFor="prod-tax-code">
                  Tax Code <span className="text-ink-muted dark:text-dark-muted font-normal">(optional)</span>
                </label>
                <input
                  id="prod-tax-code"
                  className="input-field figure"
                  value={form.taxCode}
                  onChange={(e) => handleChange('taxCode', e.target.value)}
                  placeholder="e.g. HSN/SAC code, if your region uses one"
                />
              </div>

              <div>
                <label className="label-text" htmlFor="prod-margin">
                  Target Margin (%)
                </label>
                <input
                  id="prod-margin"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.5"
                  className="input-field figure"
                  value={form.targetMarginPct}
                  onChange={(e) => handleChange('targetMarginPct', e.target.value)}
                  placeholder="e.g. 30"
                />
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
                {errors.discountValue && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.discountValue}</p>}
              </div>
            </>
          ) : (
            <div className="sm:col-span-2 rounded-lg bg-paper-dim dark:bg-dark-card2 px-3 py-2.5 text-xs text-ink-muted dark:text-dark-muted border-t border-line dark:border-dark-border mt-1">
              Tax, wholesale/cost pricing, discount, and margin targets are managed by an admin.
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="label-text" htmlFor="prod-barcode">
              Barcode
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Icon name="barcode" className="h-4 w-4 text-ink-muted dark:text-dark-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="prod-barcode"
                  className="input-field figure pl-9"
                  value={form.barcode}
                  onChange={(e) => handleChange('barcode', e.target.value)}
                  placeholder="Scan with a barcode scanner, or generate one →"
                />
              </div>
              {canManageBarcodes && (
                <button
                  type="button"
                  onClick={handleGenerateBarcode}
                  disabled={isGeneratingBarcode}
                  className="btn-outline shrink-0 text-sm transition-all duration-200 hover:-translate-y-0.5"
                >
                  {isGeneratingBarcode ? 'Generating…' : 'Generate'}
                </button>
              )}
            </div>
            {errors.barcode && <p className="text-xs text-rose dark:text-dark-rose mt-1">{errors.barcode}</p>}
          </div>

          <div className="sm:col-span-2 border-t border-line dark:border-dark-border pt-4 mt-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="section-icon bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal">
                <Icon name="inventory" className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">
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
              value={form.baseUomId}
              onChange={(e) => handleChange('baseUomId', e.target.value)}
            >
              {units.length === 0 && <option value="">No units yet — add one on the Units of Measure page</option>}
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2.5 text-sm text-ink dark:text-dark-text cursor-pointer">
              <input
                type="checkbox"
                checked={form.isBatchTracked}
                onChange={(e) => {
                  const checked = e.target.checked
                  setForm((prev) => ({
                    ...prev,
                    isBatchTracked: checked,
                    // Turning tracking on for a product that wasn't
                    // batch-tracked before: Stock Quantity locks to 0 (see
                    // the render block above) — keep the actual value in
                    // sync so submit sends what's shown, not a stale
                    // number. Turning it back off, or a product that was
                    // already batch-tracked, leaves Stock Quantity alone.
                    stock: checked && !initialValues?.isBatchTracked ? '0' : prev.stock,
                  }))
                }}
                className="rounded border-line dark:border-dark-border text-amber focus:ring-amber"
              />
              Batch/lot tracked
            </label>
          </div>

          <div className="sm:col-span-2">
            <label className="label-text">Variations</label>
            {variations.length === 0 ? null : (
              <div className="flex flex-wrap gap-3">
                {variations.map((v) => (
                  <label key={v.id} className="flex items-center gap-2 text-sm text-ink dark:text-dark-text cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={isSavedVariantProduct}
                      checked={form.variationIds.includes(v.id)}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setForm((prev) => ({
                          ...prev,
                          variationIds: checked ? [...prev.variationIds, v.id] : prev.variationIds.filter((id) => id !== v.id),
                        }))
                        setPicks([])
                      }}
                      className="rounded border-line dark:border-dark-border text-amber focus:ring-amber disabled:opacity-50"
                    />
                    {v.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="label-text">
              Dimensions
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-field figure flex-1"
                value={form.length}
                onChange={(e) => handleChange('length', e.target.value)}
                placeholder="Length"
                aria-label="Length"
              />
              <span className="self-center text-ink-muted dark:text-dark-muted text-sm">×</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-field figure flex-1"
                value={form.width}
                onChange={(e) => handleChange('width', e.target.value)}
                placeholder="Width"
                aria-label="Width"
              />
              <select
                className="input-field w-24 shrink-0"
                value={form.dimensionUnit}
                onChange={(e) => handleChange('dimensionUnit', e.target.value)}
                aria-label="Dimension unit"
              >
                <option value="ft">ft</option>
                <option value="m">m</option>
                <option value="in">in</option>
                <option value="cm">cm</option>
              </select>
            </div>
          </div>

          {form.variationIds.length > 0 && (
            <div className="sm:col-span-2">
              {isSavedVariantProduct ? (
                // Already has these Variations attached in the database —
                // safe to manage combinations live via the API right away.
                <VariantManager
                  productId={initialValues.id}
                  variationIds={initialValues.variationIds}
                  onVariantsChanged={() => setVariantsRefreshToken((t) => t + 1)}
                />
              ) : initialValues?.id ? (
                // Existing product, but Variations were only picked here
                // this session — not saved yet. Combinations can't be
                // added live yet: the backend requires Stock Quantity to
                // be 0 before the attachment itself can be saved (see
                // products.service.js#update), so jumping straight to
                // VariantManager here would let combinations be created
                // against a product that's still colorless in the
                // database.
                null
              ) : (
                <VariantValuePicker
                  variationIds={form.variationIds}
                  picks={picks}
                  onChange={setPicks}
                  targetStock={form.stock}
                />
              )}
              {errors.variants && <p className="text-xs text-rose dark:text-dark-rose mt-2">{errors.variants}</p>}
            </div>
          )}

          {form.isBatchTracked && (
            <div className="sm:col-span-2">
              {isSavedBatchProduct ? (
                // Already batch-tracked in the database — safe to manage
                // opening batches live via the API right away, exactly
                // like VariantManager does for combinations above.
                <BatchManager
                  productId={initialValues.id}
                  isVariantTracked={isSavedVariantProduct}
                  warehouses={warehouses}
                  variantsRefreshToken={variantsRefreshToken}
                />
              ) : (
                // Batch tracking was just turned on this session (or this
                // is a brand-new product) — there's nowhere to attach a
                // Batch row yet.
                null
              )}
            </div>
          )}

          <AreaCoverageFields
            enabled={enableCoverageTracking}
            onEnabledChange={setEnableCoverageTracking}
            quantity={form.coverageQuantity}
            unitId={form.coverageUomId}
            units={units}
            saleUnitLabel={units.find((u) => u.id === form.baseUomId)?.name?.toLowerCase() || 'sale unit'}
            onChange={handleChange}
          />
          {enableCoverageTracking && (errors.coverageQuantity || errors.coverageUomId) && (
            <div className="sm:col-span-2 -mt-2">
              {errors.coverageQuantity && <p className="text-xs text-rose dark:text-dark-rose">{errors.coverageQuantity}</p>}
              {errors.coverageUomId && <p className="text-xs text-rose dark:text-dark-rose">{errors.coverageUomId}</p>}
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="label-text" htmlFor="prod-image">
              Product Image
            </label>
            <div className="flex items-center gap-4">
              <div className="upload-zone h-16 w-16 rounded-xl border-2 border-dashed border-line dark:border-dark-border bg-paper-dim dark:bg-dark-card2 flex items-center justify-center overflow-hidden shrink-0">
                {imagePreview ? (
                  <img src={imagePreview} alt="Product preview" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="products" className="h-5 w-5 text-ink-muted dark:text-dark-muted" />
                )}
              </div>
              <input
                id="prod-image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="text-sm text-ink-muted dark:text-dark-muted file:mr-3 file:btn-outline file:py-1.5 file:px-3 file:text-xs file:transition-all file:duration-200 hover:file:border-amber hover:file:text-amber-dark dark:hover:file:text-amber"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-line dark:border-dark-border mt-2">
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