
const prisma = require('../../config/db');
const { getDefaultWarehouseId } = require('../../utils/defaultWarehouse');
const { PERMISSIONS } = require('../../config/permissions');

// Fields considered "pricing" — tax rate, discount, target margin, and
// cost. Editing these requires PRICING_MANAGE (Admin only by default);
// ordinary PRODUCTS_EDIT (which Warehouse Staff also has) is not enough.
// This is enforced here, not just hidden in the UI, so a crafted request
// from a non-admin account can't slip these through.
const PRICING_FIELD_KEYS = [
  'tax_rate',
  'discount_type',
  'discount_value',
  'target_margin_pct',
  'cost_price',
];

function hasPricingAccess(actorPermissions) {
  return Array.isArray(actorPermissions) && actorPermissions.includes(PERMISSIONS.PRICING_MANAGE);
}

/** Strips pricing-sensitive keys from an incoming payload when the actor
 *  isn't allowed to touch them, so create/update can stay simple below. */
function stripUnauthorizedPricingFields(data, actorPermissions) {
  if (hasPricingAccess(actorPermissions)) return data;
  const clean = { ...data };
  for (const key of PRICING_FIELD_KEYS) delete clean[key];
  return clean;
}

/** Generates a random 12-digit numeric code — a barcode value in its own
 *  right, deliberately distinct from the product's SKU (some scanners/
 *  printers behave oddly with letters, and keeping it purely numeric also
 *  makes it visually obvious this is "the barcode", not a duplicate of
 *  the SKU text). Checked against the database and re-rolled on the
 *  extremely unlikely chance of a collision, so what comes back is always
 *  actually unique before it's ever saved. */
async function generateUniqueBarcode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let code = '';
    for (let i = 0; i < 12; i += 1) code += Math.floor(Math.random() * 10);
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.product.findFirst({ where: { barcode: code } });
    if (!existing) return code;
  }
  // Practically unreachable (12 digits = 1 trillion possibilities), but
  // fall back to a timestamp-based code rather than looping forever.
  return `9${Date.now()}`.slice(0, 12);
}

// Shared include shape for a product's variation axes (which Variations
// it uses at all — see ProductVariationAxis in schema.prisma) and its
// unit of measure, used by every query that needs to build a full DTO.
const PRODUCT_INCLUDE = {
  category: true,
  base_uom: true,
  stock_levels: true,
  variation_axes: { include: { variation: true } },
};

// A variant's full value combination, e.g. "Red, Medium" — needs to walk
// through the join table to each VariationValue and its parent Variation.
const VARIANT_INCLUDE = {
  stock_levels: true,
  values: { include: { variation_value: { include: { variation: true } } } },
};

class ProductsService {
  /** Resolves which UOM a new/updated product should use. Accepts either
   *  an explicit id, or — if none given — falls back to the business's
   *  first active unit (alphabetically), the same "sensible default,
   *  never force a blocked save" spirit the old `data.base_uom || 'PIECE'`
   *  had, just against a business-managed list instead of a fixed enum. */
  async resolveBaseUomId(explicitId) {
    if (explicitId) {
      const unit = await prisma.unitOfMeasure.findUnique({ where: { id: explicitId } });
      if (!unit) {
        const err = new Error('That unit of measure no longer exists. Pick another one, or add it under Settings → Units.');
        err.status = 400;
        throw err;
      }
      return unit.id;
    }
    const fallback = await prisma.unitOfMeasure.findFirst({ where: { is_active: true }, orderBy: { name: 'asc' } });
    if (!fallback) {
      const err = new Error('This business has no units of measure yet. Add at least one under Settings → Units before adding products.');
      err.status = 400;
      throw err;
    }
    return fallback.id;
  }

  async getAll({ q, categoryId } = {}) {
    const where = {
      is_active: true,
      ...(categoryId && { category_id: categoryId }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const products = await prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return products.map((p) => this.toDTO(p));
  }

  async search(q) {
    return this.getAll({ q });
  }

  async getById(id) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      const err = new Error('Product not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(product);
  }

  /**
   * `actorPermissions` is optional so this service can still be called
   * from non-HTTP contexts (e.g. the seed script) without needing to fake
   * a permission list — in that case pricing fields are always allowed.
   *
   * `variationIds` (data.variationIds) is the set of Variations this
   * product uses at all — e.g. both "Color" and "Size" — see
   * ProductVariationAxis in schema.prisma. A product can use zero, one,
   * or several Variations at once; this is what makes multi-axis variants
   * ("Red, Medium") possible, where the old schema only ever allowed one.
   *
   * `variants`, when variationIds is non-empty, is the list of specific
   * combinations picked in the Add Product form — each
   * { variationValueIds: [id, id, ...], sku, stock, priceOverride? } —
   * one value id per axis in variationIds, pulled from each Variation's
   * globally-defined values (see the Variations module), never typed
   * fresh here. See validateVariantAllocation() for why this is required
   * and must exactly cover `data.stock`, and why the whole thing runs in
   * one transaction (see the block below).
   */
  async create(rawData, imageFile, actorPermissions = null, variants = null) {
    const data = actorPermissions === null ? rawData : stripUnauthorizedPricingFields(rawData, actorPermissions);
    const warehouseId = data.warehouseId || data.warehouse_id ? (data.warehouseId || data.warehouse_id) : await getDefaultWarehouseId();
    const initialStock = Number(data.stock ?? 0);
    const costPrice = Number(data.cost_price ?? 0);
    const variationIds = Array.isArray(data.variationIds) ? data.variationIds.filter(Boolean) : (data.variationIds ? [data.variationIds] : []);
    const isBatchTracked = data.is_batch_tracked === true || data.is_batch_tracked === 'true';
    const baseUomId = await this.resolveBaseUomId(data.baseUomId || data.base_uom_id);

    // A batch-tracked product's stock must always belong to a real Batch
    // row — that's the only thing GET /products/:id/batches (and
    // therefore the POS batch picker) ever reads from. Stock Quantity
    // entered right here on the product form has no batch-number field
    // at all, so letting it through would create a StockLevel with
    // batch_id: null — counted in the product's total stock and shown as
    // "N in stock" everywhere, but with no batch for POS to offer, making
    // it permanently unsellable there (mirrors the existing
    // colorless-stock-vs-Variation guard below). A batch-tracked product
    // therefore still always starts at 0 stock here — the real opening
    // stock is added afterward as a proper Batch via
    // createOpeningBatch()/POST /products/:id/batches, not through this
    // field (and no longer only through a throwaway Purchase either).
    if (isBatchTracked && initialStock > 0) {
      const err = new Error(
        'This product is batch-tracked, so stock must come in through a specific batch — set Stock Quantity ' +
          'to 0 and save, then add an opening batch (or receive stock via Purchases).',
      );
      err.status = 400;
      throw err;
    }

    if (variationIds.length > 0) {
      await this.validateVariantAllocation(variationIds, variants, initialStock);
    }

    // Barcode is either an existing one scanned/typed in (e.g. a
    // manufacturer's own barcode), or left null here — a distinct,
    // auto-generated code is created on demand via generateBarcode()
    // below, not silently derived from the SKU.
    const barcode = data.barcode?.trim() || null;

    const productData = {
      name: data.name,
      sku: data.sku,
      category_id: data.categoryId || data.category_id || null,
      brand: data.brand || null,
      base_uom_id: baseUomId,
      // Coverage/box-math (Area-to-Box calculator) — optional, domain-
      // specific (tile/flooring-style products). Left as-is here at the
      // schema level; only its label in the product form changed.
      coverage_per_box: data.coverage_per_box !== undefined && data.coverage_per_box !== '' ? Number(data.coverage_per_box) : null,
      conversion_factor: data.conversion_factor !== undefined && data.conversion_factor !== '' ? Number(data.conversion_factor) : null,
      is_batch_tracked: isBatchTracked,
      length: data.length !== undefined && data.length !== '' ? Number(data.length) : null,
      width: data.width !== undefined && data.width !== '' ? Number(data.width) : null,
      dimension_unit: data.dimension_unit || null,
      retail_price: Number(data.price ?? data.retail_price ?? 0),
      wholesale_price: Number(data.wholesale_price ?? data.price ?? 0),
      cost_price: costPrice,
      tax_code: data.tax_code || data.taxCode || null,
      tax_rate: Number(data.tax_rate ?? data.gst_rate ?? 0),
      discount_type: data.discount_type === 'FLAT' ? 'FLAT' : 'PERCENTAGE',
      discount_value: Number(data.discount_value ?? 0),
      target_margin_pct:
        data.target_margin_pct !== undefined && data.target_margin_pct !== '' && data.target_margin_pct !== null
          ? Number(data.target_margin_pct)
          : null,
      reorder_threshold: Number(data.reorder_threshold ?? 10),
      image_url: imageFile ? `/uploads/products/${imageFile.filename}` : null,
      barcode,
      is_active: true,
    };

    // A product with Variations attached never gets a colorless
    // (variant_id: null) stock row — every unit must belong to one of the
    // picked combinations, otherwise it becomes unreachable from POS (the
    // variant picker there only ever lists variants, it has no "no
    // value" option). So the product itself is created with zero base
    // stock, and each picked combination's stock is created alongside it,
    // all inside one transaction — if any variant fails to save, the
    // whole product creation rolls back rather than leaving a product
    // with some combinations missing.
    if (variationIds.length > 0) {
      const productId = await prisma.$transaction(async (tx) => {
        const createdProduct = await tx.product.create({ data: productData });
        await tx.productVariationAxis.createMany({
          data: variationIds.map((variationId) => ({ product_id: createdProduct.id, variation_id: variationId })),
        });
        await this.allocateVariantsInTx(tx, createdProduct.id, variants, warehouseId, costPrice, data.created_by);
        return createdProduct.id;
      });
      return this.getById(productId);
    }

    const product = await prisma.product.create({ data: productData });

    if (initialStock > 0) {
      await prisma.stockLevel.create({
        data: { product_id: product.id, warehouse_id: warehouseId, quantity: initialStock },
      });
      await prisma.stockMovement.create({
        data: {
          product_id: product.id,
          warehouse_id: warehouseId,
          movement_type: 'STOCK_IN',
          quantity: initialStock,
          reference_note: 'Initial stock on product creation',
          created_by: data.created_by,
        },
      });
      // Opening FIFO cost lot so a sale can draw a cost basis immediately,
      // without waiting for a formal purchase to be recorded first.
      await prisma.costLot.create({
        data: {
          product_id: product.id,
          warehouse_id: warehouseId,
          unit_cost: costPrice,
          quantity_received: initialStock,
          quantity_remaining: initialStock,
        },
      });
    }

    return this.getById(product.id);
  }

  /**
   * Batch-number uniqueness is scoped by product + variant (see the
   * schema.prisma comment on Batch for why this can't be a DB-level
   * unique index) — enforced here in application code instead, the same
   * pattern as assertNoDuplicateVariantCombination above. Two different
   * variants of the same product may legitimately share a batch number;
   * the same variant (or a non-variant product, variantId === null) may
   * not reuse one already in use. Shared by createOpeningBatch() below
   * and by purchases.service.js when a purchase line introduces a new
   * batch number.
   */
  async assertBatchNumberAvailable(productId, variantId, batchNumber, excludeBatchId = null) {
    const trimmed = (batchNumber || '').trim();
    if (!trimmed) {
      const err = new Error('A batch number is required.');
      err.status = 400;
      throw err;
    }
    const clash = await prisma.batch.findFirst({
      where: {
        product_id: productId,
        variant_id: variantId || null,
        batch_number: trimmed,
        ...(excludeBatchId && { id: { not: excludeBatchId } }),
      },
    });
    if (clash) {
      const err = new Error(
        variantId
          ? `Batch number "${trimmed}" is already in use for this variant.`
          : `Batch number "${trimmed}" is already in use for this product.`,
      );
      err.status = 409;
      throw err;
    }
    return trimmed;
  }

  /**
   * Opening stock for a batch-tracked product, entered directly on the
   * product form instead of through a throwaway purchase order. Creates
   * a real Batch, StockLevel, CostLot (purchase_order_id: null since it
   * isn't tied to any PO), and a STOCK_IN StockMovement — mirroring
   * exactly what a purchase does today, just without the PurchaseOrder
   * wrapper. See POST /products/:id/batches.
   */
  async createOpeningBatch(productId, data) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variation_axes: true },
    });
    if (!product) {
      const err = new Error('Product not found');
      err.status = 404;
      throw err;
    }
    if (!product.is_batch_tracked) {
      const err = new Error('This product is not batch-tracked.');
      err.status = 400;
      throw err;
    }

    const isVariantTracked = product.variation_axes.length > 0;
    const variantId = data.variantId || data.variant_id || null;
    if (isVariantTracked && !variantId) {
      const err = new Error('This product has Variations attached — pick which one this batch belongs to.');
      err.status = 400;
      throw err;
    }
    if (!isVariantTracked && variantId) {
      const err = new Error('This product has no Variations attached — a batch here can\'t be scoped to one.');
      err.status = 400;
      throw err;
    }
    if (variantId) {
      const variant = await prisma.productVariant.findFirst({ where: { id: variantId, product_id: productId } });
      if (!variant) {
        const err = new Error('That variant does not belong to this product.');
        err.status = 400;
        throw err;
      }
    }

    const quantity = Number(data.quantity ?? data.stock ?? 0);
    if (!(quantity > 0)) {
      const err = new Error('Starting quantity must be greater than 0.');
      err.status = 400;
      throw err;
    }
    const costPrice = Number(data.costPrice ?? data.cost_price ?? 0);
    if (Number.isNaN(costPrice) || costPrice < 0) {
      const err = new Error('Enter a valid cost price.');
      err.status = 400;
      throw err;
    }

    const batchNumber = await this.assertBatchNumberAvailable(productId, variantId, data.batchNumber || data.batch_number);
    const warehouseId = data.warehouseId || data.warehouse_id ? (data.warehouseId || data.warehouse_id) : await getDefaultWarehouseId();

    const batchId = await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          product_id: productId,
          variant_id: variantId,
          batch_number: batchNumber,
          received_date: new Date(),
        },
      });

      await tx.stockLevel.create({
        data: { product_id: productId, variant_id: variantId, batch_id: batch.id, warehouse_id: warehouseId, quantity },
      });

      await tx.stockMovement.create({
        data: {
          product_id: productId,
          variant_id: variantId,
          batch_id: batch.id,
          warehouse_id: warehouseId,
          movement_type: 'STOCK_IN',
          quantity,
          reference_note: 'Opening stock for new batch',
          created_by: data.created_by,
        },
      });

      await tx.costLot.create({
        data: {
          product_id: productId,
          variant_id: variantId,
          batch_id: batch.id,
          warehouse_id: warehouseId,
          purchase_order_id: null,
          unit_cost: costPrice,
          quantity_received: quantity,
          quantity_remaining: quantity,
        },
      });

      return batch.id;
    });

    return this.getBatches(productId, variantId, { includeZeroStock: true }).then((batches) => batches.find((b) => b.id === batchId));
  }

  /**
   * Enforces that Stock Quantity is fully accounted for by the picked
   * combinations — no more, no less — for a product with Variations
   * attached. Also checks:
   *  - every picked combination has exactly one value per axis in
   *    variationIds (a variant for a Color+Size product must specify
   *    both, never just one)
   *  - every picked value actually belongs to one of the attached
   *    Variations — the values a product can pick from are never
   *    invented on the fly, only selected from what's already defined on
   *    the Variations page
   *  - no two combinations in this batch are identical (e.g. two
   *    "Red, Medium" rows) — Postgres can't express this as a simple
   *    constraint on a join table, so it's checked here instead, the
   *    same way roles.service.js checks name uniqueness before insert
   *    rather than only relying on the database to catch it
   */
  async validateVariantAllocation(variationIds, variants, declaredStock) {
    if (!Array.isArray(variants) || variants.length === 0) {
      const err = new Error('Pick at least one combination before saving a product with Variations attached.');
      err.status = 400;
      throw err;
    }

    const axisCount = variationIds.length;
    const valuesByVariation = await prisma.variationValue.findMany({
      where: { variation_id: { in: variationIds }, is_active: true },
      select: { id: true, variation_id: true },
    });
    const validValueIds = new Set(valuesByVariation.map((v) => v.id));
    const variationOfValue = new Map(valuesByVariation.map((v) => [v.id, v.variation_id]));

    const seenCombinations = new Set();
    for (const v of variants) {
      const valueIds = Array.isArray(v.variationValueIds) ? v.variationValueIds : (v.variationValueIds ? [v.variationValueIds] : []);
      const sku = (v.sku || '').trim();

      if (valueIds.length !== axisCount) {
        const err = new Error(
          `Every combination needs exactly one value for each of the ${axisCount} attached Variation(s) — got ${valueIds.length}.`,
        );
        err.status = 400;
        throw err;
      }

      const axesUsed = new Set();
      for (const valueId of valueIds) {
        if (!validValueIds.has(valueId)) {
          const err = new Error('One of the picked values no longer belongs to an attached Variation.');
          err.status = 400;
          throw err;
        }
        const axis = variationOfValue.get(valueId);
        if (axesUsed.has(axis)) {
          const err = new Error('A combination can only use one value per Variation (e.g. one Color, one Size) — not two of the same axis.');
          err.status = 400;
          throw err;
        }
        axesUsed.add(axis);
      }

      if (!sku) {
        const err = new Error('Every picked combination needs its own SKU.');
        err.status = 400;
        throw err;
      }

      const comboKey = [...valueIds].sort().join('|');
      if (seenCombinations.has(comboKey)) {
        const err = new Error('Two of the picked combinations are identical — each combination can only be added once.');
        err.status = 400;
        throw err;
      }
      seenCombinations.add(comboKey);
    }

    const allocated = variants.reduce((sum, v) => sum + Number(v.stock ?? 0), 0);
    if (allocated !== Number(declaredStock)) {
      const err = new Error(
        `Stock Quantity (${declaredStock}) must exactly match the total stock across all picked combinations (currently ${allocated}). ` +
          `Adjust Stock Quantity or the per-combination stock so they match.`,
      );
      err.status = 400;
      throw err;
    }
  }

  /**
   * Checks a single new combination (used by createVariant, the "add one
   * more combination to an existing product" flow) against every
   * combination the product already has, so a duplicate can't be added
   * one at a time the way validateVariantAllocation only guards against
   * within a single batch create.
   */
  async assertNoDuplicateVariantCombination(productId, valueIds, excludeVariantId = null) {
    const existingVariants = await prisma.productVariant.findMany({
      where: { product_id: productId, is_active: true, ...(excludeVariantId && { id: { not: excludeVariantId } }) },
      include: { values: true },
    });
    const target = [...valueIds].sort().join('|');
    const clash = existingVariants.some((variant) => {
      const combo = variant.values.map((pv) => pv.variation_value_id).sort().join('|');
      return combo === target;
    });
    if (clash) {
      const err = new Error('This exact combination already exists for this product.');
      err.status = 409;
      throw err;
    }
  }

  /** Creates each picked combination's variant plus its stock/cost lot,
   *  inside an already-open transaction. Shared by create() (brand-new
   *  product) and update() (attaching Variations to an existing product). */
  async allocateVariantsInTx(tx, productId, variants, warehouseId, fallbackCostPrice, createdBy) {
    for (const v of variants) {
      const stock = Number(v.stock ?? 0);
      const valueIds = Array.isArray(v.variationValueIds) ? v.variationValueIds : (v.variationValueIds ? [v.variationValueIds] : []);
      const priceOverride =
        v.priceOverride !== undefined && v.priceOverride !== null && v.priceOverride !== ''
          ? Number(v.priceOverride)
          : null;
      const variant = await tx.productVariant.create({
        data: {
          product_id: productId,
          sku: (v.sku || '').trim().toUpperCase(),
          price_override: priceOverride,
        },
      });
      await tx.productVariantValue.createMany({
        data: valueIds.map((variationValueId) => ({ variant_id: variant.id, variation_value_id: variationValueId })),
      });

      if (stock > 0) {
        await tx.stockLevel.create({
          data: { product_id: productId, variant_id: variant.id, warehouse_id: warehouseId, quantity: stock },
        });
        await tx.stockMovement.create({
          data: {
            product_id: productId,
            variant_id: variant.id,
            warehouse_id: warehouseId,
            movement_type: 'STOCK_IN',
            quantity: stock,
            reference_note: 'Initial stock for new variant',
            created_by: createdBy,
          },
        });
        const unitCost = v.costPrice !== undefined && v.costPrice !== '' ? Number(v.costPrice) : Number(fallbackCostPrice);
        await tx.costLot.create({
          data: {
            product_id: productId,
            variant_id: variant.id,
            warehouse_id: warehouseId,
            unit_cost: unitCost,
            quantity_received: stock,
            quantity_remaining: stock,
          },
        });
      }
    }
  }

  async update(id, rawData, imageFile, actorPermissions = null) {
    const data = actorPermissions === null ? rawData : stripUnauthorizedPricingFields(rawData, actorPermissions);
    const existing = await prisma.product.findUnique({
      where: { id },
      include: { stock_levels: true, variation_axes: true, variants: { where: { is_active: true } } },
    });
    if (!existing) {
      const err = new Error('Product not found');
      err.status = 404;
      throw err;
    }

    const newVariationIds = data.variationIds !== undefined
      ? (Array.isArray(data.variationIds) ? data.variationIds.filter(Boolean) : (data.variationIds ? [data.variationIds] : []))
      : undefined;
    const existingVariationIds = existing.variation_axes.map((a) => a.variation_id);

    if (newVariationIds !== undefined && existing.variants.length > 0) {
      // Changing which Variations a product uses once real combinations
      // already exist would orphan them (a "Red, Medium" variant makes no
      // sense if Size is removed as an axis) — same spirit as the
      // existing turningOnVariantTracking/turningOnBatchTracking guards
      // below: block the axis change until existing variants are removed
      // first, rather than silently corrupting them.
      const sameSet = newVariationIds.length === existingVariationIds.length
        && newVariationIds.every((v) => existingVariationIds.includes(v));
      if (!sameSet) {
        const err = new Error(
          `This product already has ${existing.variants.length} combination(s) saved. Remove them from the Variant ` +
            `panel first before changing which Variations this product uses.`,
        );
        err.status = 400;
        throw err;
      }
    }

    const baseUomId = data.baseUomId !== undefined || data.base_uom_id !== undefined
      ? await this.resolveBaseUomId(data.baseUomId || data.base_uom_id)
      : undefined;

    await prisma.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.sku !== undefined && { sku: data.sku }),
        ...((data.categoryId !== undefined || data.category_id !== undefined) && {
          category_id: data.categoryId || data.category_id || null,
        }),
        ...(data.brand !== undefined && { brand: data.brand }),
        ...((data.price !== undefined || data.retail_price !== undefined) && {
          retail_price: Number(data.price ?? data.retail_price),
        }),
        ...(data.wholesale_price !== undefined && { wholesale_price: Number(data.wholesale_price) }),
        ...(data.cost_price !== undefined && { cost_price: Number(data.cost_price) }),
        ...((data.tax_code !== undefined || data.taxCode !== undefined) && { tax_code: data.tax_code || data.taxCode || null }),
        ...((data.tax_rate !== undefined || data.gst_rate !== undefined) && { tax_rate: Number(data.tax_rate ?? data.gst_rate) }),
        ...(data.discount_type !== undefined && { discount_type: data.discount_type === 'FLAT' ? 'FLAT' : 'PERCENTAGE' }),
        ...(data.discount_value !== undefined && { discount_value: Number(data.discount_value) }),
        ...(data.target_margin_pct !== undefined && {
          target_margin_pct: data.target_margin_pct === '' || data.target_margin_pct === null ? null : Number(data.target_margin_pct),
        }),
        ...(data.reorder_threshold !== undefined && { reorder_threshold: Number(data.reorder_threshold) }),
        ...(data.barcode !== undefined && { barcode: data.barcode?.trim() || null }),
        ...(baseUomId !== undefined && { base_uom_id: baseUomId }),
        ...(data.coverage_per_box !== undefined && {
          coverage_per_box: data.coverage_per_box === '' ? null : Number(data.coverage_per_box),
        }),
        ...(data.conversion_factor !== undefined && {
          conversion_factor: data.conversion_factor === '' ? null : Number(data.conversion_factor),
        }),
        ...(data.is_batch_tracked !== undefined && {
          is_batch_tracked: data.is_batch_tracked === true || data.is_batch_tracked === 'true',
        }),
        ...(data.length !== undefined && { length: data.length === '' ? null : Number(data.length) }),
        ...(data.width !== undefined && { width: data.width === '' ? null : Number(data.width) }),
        ...(data.dimension_unit !== undefined && { dimension_unit: data.dimension_unit || null }),
        ...(imageFile && { image_url: `/uploads/products/${imageFile.filename}` }),
      },
    });

    // Attaching Variations for the first time (existing had none, request
    // supplies a non-empty set) — create the axis rows now. (Removing/
    // changing axes once variants exist is blocked above; attaching to a
    // product that had zero axes and zero variants is always safe.)
    if (newVariationIds !== undefined && existingVariationIds.length === 0 && newVariationIds.length > 0) {
      await prisma.productVariationAxis.createMany({
        data: newVariationIds.map((variationId) => ({ product_id: id, variation_id: variationId })),
      });
    }

    // Whether the product will have Variations attached *after* this
    // update (may be attaching right now, or may already have been on).
    const willBeVariantTracked = newVariationIds !== undefined ? newVariationIds.length > 0 : existingVariationIds.length > 0;
    const turningOnVariantTracking = willBeVariantTracked && existingVariationIds.length === 0 && newVariationIds !== undefined;

    // Same idea, but for Batch tracking instead of Variations.
    const willBeBatchTracked =
      data.is_batch_tracked !== undefined
        ? data.is_batch_tracked === true || data.is_batch_tracked === 'true'
        : Boolean(existing.is_batch_tracked);
    const turningOnBatchTracking = willBeBatchTracked && !existing.is_batch_tracked && data.is_batch_tracked !== undefined;

    if (turningOnVariantTracking) {
      // Attaching Variations to a product that already has plain
      // (colorless) stock. That stock would become permanently
      // unreachable from POS the moment Variations are attached (the POS
      // variant picker only ever lists variants — see
      // VariantBatchSelectorModal), so refuse the change until it's been
      // zeroed out here first — the admin can then reopen this product
      // and add combinations with their own stock via the Variant panel
      // below.
      const colorlessTotal = existing.stock_levels
        .filter((sl) => sl.variant_id === null)
        .reduce((sum, sl) => sum + Number(sl.quantity), 0);
      if (colorlessTotal > 0) {
        const err = new Error(
          `This product still has ${colorlessTotal} unit(s) of general (unassigned) stock. Set Stock Quantity to 0 ` +
            `and save first — general stock can't be sold once Variations are attached — then reopen this product ` +
            `to add combinations, each with its own stock.`,
        );
        err.status = 400;
        throw err;
      }
    }

    if (turningOnBatchTracking) {
      // Same failure mode as above, but for Batch tracking: any stock
      // this product already has sits in a StockLevel row with
      // batch_id: null. Once is_batch_tracked flips on, POS requires a
      // batchId to sell this product at all (see VariantBatchSelectorModal
      // / getBatches()) — and un-batched stock has no batch for that
      // picker to offer, so it would silently become unsellable. Refuse
      // until it's zeroed out, then bring stock in properly (with a
      // batch number) via the new opening-batch panel on this form, or
      // via Purchases.
      const unbatchedTotal = existing.stock_levels
        .filter((sl) => sl.batch_id === null)
        .reduce((sum, sl) => sum + Number(sl.quantity), 0);
      if (unbatchedTotal > 0) {
        const err = new Error(
          `This product still has ${unbatchedTotal} unit(s) of stock that aren't assigned to any batch. Set Stock ` +
            `Quantity to 0 and save first — un-batched stock can't be sold once Batch tracking is on — then add an ` +
            `opening batch (or bring stock in via Purchases).`,
        );
        err.status = 400;
        throw err;
      }
    }

    // Optional stock adjustment: if `stock` is passed, reconcile the total
    // colorless stock across the target warehouse to match the new value.
    // Never runs for a product with Variations attached — every unit
    // there must belong to a specific combination (added via the Variant
    // panel / VariantManager, not this field), otherwise it would end up
    // in a colorless stock row the POS variant picker can never sell, and
    // this block's old `findFirst` (unfiltered by variant_id) could also
    // have silently overwritten an existing variant's stock row instead.
    // Also never runs for a batch-tracked product, for the identical
    // reason — this field has no batch-number input, so any increase
    // here would create exactly the un-batched, unsellable stock the
    // guard above exists to prevent. Batch-tracked stock must always
    // come in through Purchases.
    if (data.stock !== undefined && !willBeVariantTracked && !willBeBatchTracked) {
      const warehouseId = data.warehouseId || data.warehouse_id ? (data.warehouseId || data.warehouse_id) : await getDefaultWarehouseId();
      const currentTotal = existing.stock_levels.reduce((sum, sl) => sum + Number(sl.quantity), 0);
      const target = Number(data.stock);
      const delta = target - currentTotal;

      if (delta !== 0) {
        const level = await prisma.stockLevel.findFirst({
          where: { product_id: id, warehouse_id: warehouseId, batch_id: null, variant_id: null },
        });
        if (level) {
          await prisma.stockLevel.update({
            where: { id: level.id },
            data: { quantity: Math.max(0, Number(level.quantity) + delta) },
          });
        } else {
          await prisma.stockLevel.create({
            data: { product_id: id, warehouse_id: warehouseId, quantity: Math.max(0, delta) },
          });
        }
        await prisma.stockMovement.create({
          data: {
            product_id: id,
            warehouse_id: warehouseId,
            movement_type: 'ADJUSTMENT',
            quantity: delta,
            reference_note: 'Manual stock adjustment via product edit',
            created_by: data.created_by,
          },
        });
        // A manual stock-up here (not through the Purchases flow) still
        // needs a cost basis for future FIFO sales — open a lot at the
        // product's current cost_price for the added quantity.
        if (delta > 0) {
          const current = await prisma.product.findUnique({ where: { id } });
          await prisma.costLot.create({
            data: {
              product_id: id,
              warehouse_id: warehouseId,
              unit_cost: current.cost_price,
              quantity_received: delta,
              quantity_remaining: delta,
            },
          });
        }
      }
    }

    return this.getById(id);
  }

  /**
   * Barcode-scanner lookup — tries an exact barcode match first (what a
   * real scan produces), then falls back to SKU for products that don't
   * have a barcode assigned yet. Returns null (not a throw) on no match
   * so the caller can decide how to handle "not found" in a scan flow.
   */
  async lookupByCode(code) {
    const trimmed = String(code || '').trim();
    if (!trimmed) return null;

    const product = await prisma.product.findFirst({
      where: {
        is_active: true,
        OR: [{ barcode: trimmed }, { sku: { equals: trimmed, mode: 'insensitive' } }],
      },
      include: PRODUCT_INCLUDE,
    });
    return product ? this.toDTO(product) : null;
  }

  /**
   * Generates and persists a distinct barcode for an existing product,
   * overwriting whatever (if anything) is there. Used by two places: the
   * product form's "Generate" button once a product has been saved, and
   * the Barcode Labels page, which calls this automatically the moment a
   * product without a barcode is selected for printing — so printing
   * never has to be blocked on a separate trip to the product form first.
   */
  async generateBarcode(id) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      const err = new Error('Product not found');
      err.status = 404;
      throw err;
    }
    const barcode = await generateUniqueBarcode();
    await prisma.product.update({ where: { id }, data: { barcode } });
    return this.getById(id);
  }

  /**
   * Available batches, optionally scoped to one variant. When a product
   * is both batch- and variant-tracked, the POS flow is: pick a variant
   * first, then call this with that variantId to list only the batches
   * belonging to that combination — not every batch of every combination.
   *
   * `includeZeroStock` — POS-facing calls (selling) must keep filtering
   * to `stock > 0` so a customer is never offered a depleted batch; the
   * Purchases restock picker and the product-form batch panel pass
   * `includeZeroStock: true` instead, since a depleted batch is exactly
   * the kind of batch that needs to be found again to restock it.
   */
  async getBatches(productId, variantId = null, { includeZeroStock = false } = {}) {
    const batches = await prisma.batch.findMany({
      where: { product_id: productId, ...(variantId !== null && { variant_id: variantId }) },
      include: { stock_levels: true },
      orderBy: { received_date: 'asc' },
    });
    const withStock = batches.map((b) => ({
      id: b.id,
      variantId: b.variant_id,
      batchNumber: b.batch_number,
      receivedDate: b.received_date,
      stock: b.stock_levels.reduce((sum, sl) => sum + Number(sl.quantity), 0),
    }));
    return includeZeroStock ? withStock : withStock.filter((b) => b.stock > 0);
  }

  /**
   * The specific combinations a product actually sells (e.g. "Red,
   * Medium") — a deliberate customer choice, not the same thing as a
   * Batch (incidental manufacturing lot variation the customer never
   * chooses between). See the ProductVariant/Variation model comments in
   * schema.prisma for the full distinction. Only relevant for products
   * with Variations attached, but this works regardless — the attached
   * Variations just control whether the frontend shows variant selection
   * at all, and which values are available to pick from.
   */
  async getVariants(productId) {
    const variants = await prisma.productVariant.findMany({
      where: { product_id: productId, is_active: true },
      include: VARIANT_INCLUDE,
      orderBy: { sku: 'asc' },
    });
    const product = await prisma.product.findUnique({ where: { id: productId } });
    return variants.map((v) => this.variantToDTO(v, product));
  }

  /** Adds ONE more combination to a product that already has Variations
   *  attached — the "add another value later" flow, distinct from the
   *  batch-creation path in create()/allocateVariantsInTx above. */
  async createVariant(productId, data) {
    const product = await prisma.product.findUnique({ where: { id: productId }, include: { variation_axes: true } });
    if (!product) {
      const err = new Error('Product not found');
      err.status = 404;
      throw err;
    }
    if (product.variation_axes.length === 0) {
      const err = new Error('Attach at least one Variation to this product before adding combinations.');
      err.status = 400;
      throw err;
    }

    const valueIds = Array.isArray(data.variationValueIds) ? data.variationValueIds : (data.variationValueIds ? [data.variationValueIds] : []);
    const axisIds = product.variation_axes.map((a) => a.variation_id);
    if (valueIds.length !== axisIds.length) {
      const err = new Error(`This product needs exactly one value for each of its ${axisIds.length} attached Variation(s).`);
      err.status = 400;
      throw err;
    }
    const values = await prisma.variationValue.findMany({ where: { id: { in: valueIds } } });
    const axesUsed = new Set();
    for (const value of values) {
      if (!axisIds.includes(value.variation_id)) {
        const err = new Error('One of the picked values does not belong to this product\'s attached Variations.');
        err.status = 400;
        throw err;
      }
      if (axesUsed.has(value.variation_id)) {
        const err = new Error('A combination can only use one value per Variation — not two of the same axis.');
        err.status = 400;
        throw err;
      }
      axesUsed.add(value.variation_id);
    }
    if (values.length !== valueIds.length) {
      const err = new Error('One of the picked values no longer exists.');
      err.status = 400;
      throw err;
    }

    await this.assertNoDuplicateVariantCombination(productId, valueIds);

    const warehouseId = data.warehouseId || data.warehouse_id ? (data.warehouseId || data.warehouse_id) : await getDefaultWarehouseId();
    const initialStock = Number(data.stock ?? 0);
    // A combination's own cost, if given, otherwise it starts from the
    // product's base cost — either way, this only seeds the opening cost
    // lot; ongoing cost differences by combination come from purchases
    // scoped to this variant, same as batch costing.
    const costPrice = data.cost_price !== undefined && data.cost_price !== '' ? Number(data.cost_price) : Number(product.cost_price);
    const priceOverride =
      data.priceOverride !== undefined && data.priceOverride !== null && data.priceOverride !== ''
        ? Number(data.priceOverride)
        : null;

    const variant = await prisma.$transaction(async (tx) => {
      const created = await tx.productVariant.create({
        data: { product_id: productId, sku: data.sku, price_override: priceOverride },
      });
      await tx.productVariantValue.createMany({
        data: valueIds.map((variationValueId) => ({ variant_id: created.id, variation_value_id: variationValueId })),
      });

      if (initialStock > 0) {
        await tx.stockLevel.create({
          data: { product_id: productId, variant_id: created.id, warehouse_id: warehouseId, quantity: initialStock },
        });
        await tx.stockMovement.create({
          data: {
            product_id: productId,
            variant_id: created.id,
            warehouse_id: warehouseId,
            movement_type: 'STOCK_IN',
            quantity: initialStock,
            reference_note: 'Initial stock for new variant',
            created_by: data.created_by,
          },
        });
        await tx.costLot.create({
          data: {
            product_id: productId,
            variant_id: created.id,
            warehouse_id: warehouseId,
            unit_cost: costPrice,
            quantity_received: initialStock,
            quantity_remaining: initialStock,
          },
        });
      }
      return created;
    });

    const refreshedProduct = await prisma.product.findUnique({ where: { id: productId } });
    const full = await prisma.productVariant.findUnique({ where: { id: variant.id }, include: VARIANT_INCLUDE });
    return this.variantToDTO(full, refreshedProduct);
  }

  async updateVariant(variantId, data) {
    const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!existing) {
      const err = new Error('Variant not found');
      err.status = 404;
      throw err;
    }
    const updated = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(data.sku !== undefined && { sku: data.sku }),
        ...((data.priceOverride !== undefined || data.price_override !== undefined) && {
          price_override:
            (data.priceOverride ?? data.price_override) === '' || (data.priceOverride ?? data.price_override) === null
              ? null
              : Number(data.priceOverride ?? data.price_override),
        }),
      },
      include: VARIANT_INCLUDE,
    });
    const product = await prisma.product.findUnique({ where: { id: existing.product_id } });
    return this.variantToDTO(updated, product);
  }

  /** Soft-deletes (deactivates) a variant if it has sales history, same
   *  pattern as remove() for a whole product — otherwise hard-deletes. */
  async removeVariant(variantId) {
    const usageCount = await prisma.invoiceItem.count({ where: { variant_id: variantId } });
    if (usageCount > 0) {
      await prisma.productVariant.update({ where: { id: variantId }, data: { is_active: false } });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.productVariantValue.deleteMany({ where: { variant_id: variantId } });
      await tx.productVariant.delete({ where: { id: variantId } });
    });
  }

  variantToDTO(variant, product) {
    const stock = (variant.stock_levels || []).reduce((sum, sl) => sum + Number(sl.quantity), 0);
    const linkedValues = variant.values || [];
    // A variant's price adjustment is the SUM across every linked value
    // — e.g. "Red" +0 and "Large" +200 combine to +200 — this is the
    // core of multi-axis pricing, replacing the old single-value lookup.
    const priceAdjustment =
      variant.price_override !== null && variant.price_override !== undefined
        ? Number(variant.price_override)
        : linkedValues.reduce((sum, pv) => sum + Number(pv.variation_value?.price_adjustment ?? 0), 0);
    return {
      id: variant.id,
      productId: variant.product_id,
      variationValueIds: linkedValues.map((pv) => pv.variation_value_id),
      // Display name — e.g. "Red / Medium" — built from every linked
      // value's own name, joined for readability, never stored
      // redundantly on the variant itself.
      name: linkedValues.map((pv) => pv.variation_value?.value ?? '').filter(Boolean).join(' / '),
      values: linkedValues.map((pv) => ({
        variationValueId: pv.variation_value_id,
        variationId: pv.variation_value?.variation_id,
        variationName: pv.variation_value?.variation?.name ?? '',
        value: pv.variation_value?.value ?? '',
      })),
      sku: variant.sku,
      priceOverride:
        variant.price_override !== null && variant.price_override !== undefined ? Number(variant.price_override) : null,
      priceAdjustment,
      // The actual sellable price for this specific combination — base
      // product price plus its combined price adjustment (or override).
      // Computed here so the frontend never has to duplicate this math.
      price: product ? Number(product.retail_price) + priceAdjustment : null,
      wholesalePrice: product ? Number(product.wholesale_price) + priceAdjustment : null,
      image: variant.image_url,
      stock,
      isActive: variant.is_active,
    };
  }

  async remove(id) {
    const [invoiceUsage, purchaseUsage, kitUsage] = await Promise.all([
      prisma.invoiceItem.count({ where: { product_id: id } }),
      prisma.purchaseOrderItem.count({ where: { product_id: id } }),
      prisma.kitComponent.count({ where: { component_product_id: id } }),
    ]);
    if (invoiceUsage > 0 || purchaseUsage > 0 || kitUsage > 0) {
      // FR-3.2.7 — cannot delete a product with real transaction history
      // (sold, purchased, or used as a kit component). Soft-delete
      // instead so that history stays intact and reportable.
      await prisma.product.update({ where: { id }, data: { is_active: false } });
      return;
    }

    // No real transaction history — safe to hard-delete. But every
    // dependent stock record (levels, movements, cost lots, batches,
    // transfers, variants, variant values, variation axes) has a
    // RESTRICT foreign key back to this product, so Postgres blocks the
    // delete until those are cleared first — there's no real history for
    // any of them to lose here, unlike invoices/purchases/kits above. All
    // inside one transaction so a partial cleanup can't happen.
    await prisma.$transaction(async (tx) => {
      await tx.stockTransfer.deleteMany({ where: { product_id: id } });
      await tx.stockMovement.deleteMany({ where: { product_id: id } });
      await tx.costLot.deleteMany({ where: { product_id: id } });
      await tx.stockLevel.deleteMany({ where: { product_id: id } });
      await tx.batch.deleteMany({ where: { product_id: id } });
      const variantIds = (await tx.productVariant.findMany({ where: { product_id: id }, select: { id: true } })).map((v) => v.id);
      if (variantIds.length > 0) {
        await tx.productVariantValue.deleteMany({ where: { variant_id: { in: variantIds } } });
      }
      await tx.productVariant.deleteMany({ where: { product_id: id } });
      await tx.productVariationAxis.deleteMany({ where: { product_id: id } });
      await tx.product.delete({ where: { id } });
    });
  }

  toDTO(product) {
    const stock = (product.stock_levels || []).reduce((sum, sl) => sum + Number(sl.quantity), 0);
    const retailPrice = Number(product.retail_price);
    const targetMarginPct = product.target_margin_pct !== null && product.target_margin_pct !== undefined ? Number(product.target_margin_pct) : null;

    // "Markup on cost" (confirmed definition): target% is profit added on
    // top of cost, i.e. price = cost * (1 + target/100). Actual markup
    // right now, vs. the target — purely informational, used by the
    // product list/form to show a "drifted from target" nudge. Never
    // changes the price itself.
    let marginAlert = false;
    if (targetMarginPct !== null && Number(product.cost_price) > 0) {
      const actualMarginPct = ((retailPrice - Number(product.cost_price)) / Number(product.cost_price)) * 100;
      marginAlert = Math.abs(actualMarginPct - targetMarginPct) > 2; // >2pt drift
    }

    const axes = product.variation_axes || [];

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.category_id,
      category: product.category?.name || 'Uncategorized',
      brand: product.brand,
      price: retailPrice,
      wholesalePrice: Number(product.wholesale_price),
      costPrice: Number(product.cost_price),
      taxCode: product.tax_code,
      taxRate: Number(product.tax_rate),
      discountType: product.discount_type,
      discountValue: Number(product.discount_value),
      targetMarginPct,
      marginAlert,
      reorderThreshold: product.reorder_threshold,
      stock,
      lowStock: stock <= product.reorder_threshold,
      image: product.image_url,
      barcode: product.barcode,
      isActive: product.is_active,
      baseUomId: product.base_uom_id,
      baseUom: product.base_uom?.name ?? null,
      baseUomAbbreviation: product.base_uom?.abbreviation ?? null,
      // FR: Flexible UoM Conversion — coveragePerBox (sq ft per box) powers
      // the Area-to-Box calculator; conversionFactor is a generic
      // base-units-per-alternate-unit ratio. Both optional — meaningful
      // mainly for tile/flooring-style products, harmless (null) for
      // anything else.
      coveragePerBox: product.coverage_per_box !== null && product.coverage_per_box !== undefined ? Number(product.coverage_per_box) : null,
      conversionFactor: product.conversion_factor !== null && product.conversion_factor !== undefined ? Number(product.conversion_factor) : null,
      // FR: Batch & Lot Tracking — when true, this product must be sold
      // from a specific batch (see GET /products/:id/batches).
      isBatchTracked: product.is_batch_tracked,
      // Variation attachment — a deliberate customer choice, distinct
      // from batch tracking (see GET /products/:id/variants). A product
      // can use MULTIPLE Variations at once now (e.g. Color AND Size),
      // can be both variant- and batch-tracked at once, and
      // `isVariantTracked` is derived, not stored — true whenever at
      // least one Variation is attached.
      variationIds: axes.map((a) => a.variation_id),
      variationNames: axes.map((a) => a.variation?.name).filter(Boolean),
      isVariantTracked: axes.length > 0,
      length: product.length !== null && product.length !== undefined ? Number(product.length) : null,
      width: product.width !== null && product.width !== undefined ? Number(product.width) : null,
      dimensionUnit: product.dimension_unit,
    };
  }
}

module.exports = new ProductsService();

