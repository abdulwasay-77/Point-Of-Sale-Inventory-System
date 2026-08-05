
const prisma = require('../../config/db');
const { getDefaultWarehouseId } = require('../../utils/defaultWarehouse');
const { PERMISSIONS } = require('../../config/permissions');

// Fields considered "pricing" — GST, discount, target margin, and cost.
// Editing these requires PRICING_MANAGE (Admin only by default); ordinary
// PRODUCTS_EDIT (which Warehouse Staff also has) is not enough. This is
// enforced here, not just hidden in the UI, so a crafted request from a
// non-admin account can't slip these through.
const PRICING_FIELD_KEYS = [
  'gst_rate',
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

class ProductsService {
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
      include: { category: true, variation: true, stock_levels: true },
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
      include: { category: true, variation: true, stock_levels: true },
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
   * `variants`, when a Variation is attached (`data.variation_id`), is the
   * list of specific values picked in the Add Product form — each
   * { variationValueId, sku, stock, priceOverride? } — pulled from that
   * Variation's globally-defined values (see the Variations module),
   * never typed fresh here. See validateVariantAllocation() for why this
   * is required and must exactly cover `data.stock`, and why the whole
   * thing runs in one transaction (see the block below).
   */
  async create(rawData, imageFile, actorPermissions = null, variants = null) {
    const data = actorPermissions === null ? rawData : stripUnauthorizedPricingFields(rawData, actorPermissions);
    const warehouseId = await getDefaultWarehouseId();
    const initialStock = Number(data.stock ?? 0);
    const costPrice = Number(data.cost_price ?? 0);
    const variationId = data.variationId || data.variation_id || null;
    const isBatchTracked = data.is_batch_tracked === true || data.is_batch_tracked === 'true';

    // A batch-tracked product's stock must always belong to a real Batch
    // row (batch_number + optional shade_code) — that's the only thing
    // GET /products/:id/batches (and therefore the POS batch picker)
    // ever reads from. Stock Quantity entered right here on the product
    // form has no batch-number field at all, so letting it through would
    // create a StockLevel with batch_id: null — counted in the product's
    // total stock and shown as "N in stock" everywhere, but with no
    // batch for POS to offer, making it permanently unsellable there
    // (mirrors the existing colorless-stock-vs-Variation guard below).
    if (isBatchTracked && initialStock > 0) {
      const err = new Error(
        'This product is batch-tracked, so stock must come in through a specific batch — set Stock Quantity ' +
          'to 0 and save, then receive stock with a batch number via Purchases (or record an opening batch there).',
      );
      err.status = 400;
      throw err;
    }

    if (variationId) {
      await this.validateVariantAllocation(variationId, variants, initialStock);
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
      base_uom: data.base_uom || 'PIECE',
      coverage_per_box: data.coverage_per_box !== undefined && data.coverage_per_box !== '' ? Number(data.coverage_per_box) : null,
      conversion_factor: data.conversion_factor !== undefined && data.conversion_factor !== '' ? Number(data.conversion_factor) : null,
      is_batch_tracked: isBatchTracked,
      variation_id: variationId,
      length: data.length !== undefined && data.length !== '' ? Number(data.length) : null,
      width: data.width !== undefined && data.width !== '' ? Number(data.width) : null,
      dimension_unit: data.dimension_unit || null,
      retail_price: Number(data.price ?? data.retail_price ?? 0),
      wholesale_price: Number(data.wholesale_price ?? data.price ?? 0),
      cost_price: costPrice,
      hsn_code: data.hsn_code || '0000',
      gst_rate: Number(data.gst_rate ?? 0),
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

    // A product with a Variation attached never gets a colorless
    // (variant_id: null) stock row — every unit must belong to one of the
    // picked values, otherwise it becomes unreachable from POS (the
    // variant picker there only ever lists variants, it has no "no
    // value" option). So the product itself is created with zero base
    // stock, and each picked value's stock is created alongside it, all
    // inside one transaction — if any variant fails to save, the whole
    // product creation rolls back rather than leaving a product with
    // some values missing.
    if (variationId) {
      const productId = await prisma.$transaction(async (tx) => {
        const createdProduct = await tx.product.create({ data: productData });
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
   * Enforces that Stock Quantity is fully accounted for by the picked
   * values — no more, no less — for a product with a Variation attached.
   * This is the fix for the bug where units entered in the top-level
   * Stock Quantity field silently ended up in a colorless stock row that
   * the POS variant picker could never sell: rather than allow that split
   * to exist at all, saving is blocked until the two numbers match
   * exactly. Also checks every picked value actually belongs to the
   * chosen Variation — the values a product can pick from are never
   * invented on the fly, only selected from what's already defined on
   * the Variations page.
   */
  async validateVariantAllocation(variationId, variants, declaredStock) {
    if (!Array.isArray(variants) || variants.length === 0) {
      const err = new Error('Pick at least one value before saving a product with a Variation attached.');
      err.status = 400;
      throw err;
    }
    const validValueIds = new Set(
      (await prisma.variationValue.findMany({ where: { variation_id: variationId, is_active: true }, select: { id: true } })).map(
        (v) => v.id,
      ),
    );
    for (const v of variants) {
      const variationValueId = v.variationValueId || v.variation_value_id;
      const sku = (v.sku || '').trim();
      if (!variationValueId || !validValueIds.has(variationValueId)) {
        const err = new Error('One of the picked values no longer belongs to this variation.');
        err.status = 400;
        throw err;
      }
      if (!sku) {
        const err = new Error('Every picked value needs its own SKU.');
        err.status = 400;
        throw err;
      }
    }
    const allocated = variants.reduce((sum, v) => sum + Number(v.stock ?? 0), 0);
    if (allocated !== Number(declaredStock)) {
      const err = new Error(
        `Stock Quantity (${declaredStock}) must exactly match the total stock across all picked values (currently ${allocated}). ` +
          `Adjust Stock Quantity or the per-value stock so they match.`,
      );
      err.status = 400;
      throw err;
    }
  }

  /** Creates each picked value's variant plus its stock/cost lot, inside
   *  an already-open transaction. Shared by create() (brand-new product)
   *  and update() (attaching a Variation to an existing product). */
  async allocateVariantsInTx(tx, productId, variants, warehouseId, fallbackCostPrice, createdBy) {
    for (const v of variants) {
      const stock = Number(v.stock ?? 0);
      const variationValueId = v.variationValueId || v.variation_value_id;
      const priceOverride =
        v.priceOverride !== undefined && v.priceOverride !== null && v.priceOverride !== ''
          ? Number(v.priceOverride)
          : null;
      const variant = await tx.productVariant.create({
        data: {
          product_id: productId,
          variation_value_id: variationValueId,
          sku: (v.sku || '').trim().toUpperCase(),
          price_override: priceOverride,
        },
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
    const existing = await prisma.product.findUnique({ where: { id }, include: { stock_levels: true } });
    if (!existing) {
      const err = new Error('Product not found');
      err.status = 404;
      throw err;
    }

    const newVariationId = data.variationId !== undefined ? data.variationId || null : data.variation_id !== undefined ? data.variation_id || null : undefined;

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
        ...(data.hsn_code !== undefined && { hsn_code: data.hsn_code }),
        ...(data.gst_rate !== undefined && { gst_rate: Number(data.gst_rate) }),
        ...(data.discount_type !== undefined && { discount_type: data.discount_type === 'FLAT' ? 'FLAT' : 'PERCENTAGE' }),
        ...(data.discount_value !== undefined && { discount_value: Number(data.discount_value) }),
        ...(data.target_margin_pct !== undefined && {
          target_margin_pct: data.target_margin_pct === '' || data.target_margin_pct === null ? null : Number(data.target_margin_pct),
        }),
        ...(data.reorder_threshold !== undefined && { reorder_threshold: Number(data.reorder_threshold) }),
        ...(data.barcode !== undefined && { barcode: data.barcode?.trim() || null }),
        ...(data.base_uom !== undefined && { base_uom: data.base_uom }),
        ...(data.coverage_per_box !== undefined && {
          coverage_per_box: data.coverage_per_box === '' ? null : Number(data.coverage_per_box),
        }),
        ...(data.conversion_factor !== undefined && {
          conversion_factor: data.conversion_factor === '' ? null : Number(data.conversion_factor),
        }),
        ...(data.is_batch_tracked !== undefined && {
          is_batch_tracked: data.is_batch_tracked === true || data.is_batch_tracked === 'true',
        }),
        ...(newVariationId !== undefined && { variation_id: newVariationId }),
        ...(data.length !== undefined && { length: data.length === '' ? null : Number(data.length) }),
        ...(data.width !== undefined && { width: data.width === '' ? null : Number(data.width) }),
        ...(data.dimension_unit !== undefined && { dimension_unit: data.dimension_unit || null }),
        ...(imageFile && { image_url: `/uploads/products/${imageFile.filename}` }),
      },
    });

    // Whether the product will have a Variation attached *after* this
    // update (may be attaching right now, or may already have been on).
    const willBeVariantTracked = newVariationId !== undefined ? Boolean(newVariationId) : Boolean(existing.variation_id);
    const turningOnVariantTracking = willBeVariantTracked && !existing.variation_id && newVariationId !== undefined;

    // Same idea, but for Batch tracking instead of a Variation.
    const willBeBatchTracked =
      data.is_batch_tracked !== undefined
        ? data.is_batch_tracked === true || data.is_batch_tracked === 'true'
        : Boolean(existing.is_batch_tracked);
    const turningOnBatchTracking = willBeBatchTracked && !existing.is_batch_tracked && data.is_batch_tracked !== undefined;

    if (turningOnVariantTracking) {
      // Attaching a Variation to a product that already has plain
      // (colorless) stock. That stock would become permanently
      // unreachable from POS the moment a Variation is attached (the POS
      // variant picker only ever lists variants — see
      // VariantBatchSelectorModal), so refuse the change until it's been
      // zeroed out here first — the admin can then reopen this product
      // and add values with their own stock via the Variant panel below.
      const colorlessTotal = existing.stock_levels
        .filter((sl) => sl.variant_id === null)
        .reduce((sum, sl) => sum + Number(sl.quantity), 0);
      if (colorlessTotal > 0) {
        const err = new Error(
          `This product still has ${colorlessTotal} unit(s) of general (unassigned) stock. Set Stock Quantity to 0 ` +
            `and save first — general stock can't be sold once a Variation is attached — then reopen this product ` +
            `to add values, each with its own stock.`,
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
      // batch number) via Purchases.
      const unbatchedTotal = existing.stock_levels
        .filter((sl) => sl.batch_id === null)
        .reduce((sum, sl) => sum + Number(sl.quantity), 0);
      if (unbatchedTotal > 0) {
        const err = new Error(
          `This product still has ${unbatchedTotal} unit(s) of stock that aren't assigned to any batch. Set Stock ` +
            `Quantity to 0 and save first — un-batched stock can't be sold once Batch tracking is on — then bring ` +
            `stock in with a batch number via Purchases.`,
        );
        err.status = 400;
        throw err;
      }
    }

    // Optional stock adjustment: if `stock` is passed, reconcile the total
    // colorless stock across the default warehouse to match the new
    // value. Never runs for a product with a Variation attached — every
    // unit there must belong to a specific value (added via the Variant
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
      const warehouseId = await getDefaultWarehouseId();
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
      include: { category: true, variation: true, stock_levels: true },
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
   * belonging to that value — not every batch of every value.
   */
  async getBatches(productId, variantId = null) {
    const batches = await prisma.batch.findMany({
      where: { product_id: productId, ...(variantId !== null && { variant_id: variantId }) },
      include: { stock_levels: true },
      orderBy: { received_date: 'asc' },
    });
    return batches
      .map((b) => ({
        id: b.id,
        variantId: b.variant_id,
        batchNumber: b.batch_number,
        shadeCode: b.shade_code,
        receivedDate: b.received_date,
        stock: b.stock_levels.reduce((sum, sl) => sum + Number(sl.quantity), 0),
      }))
      .filter((b) => b.stock > 0);
  }

  /**
   * The specific values a product actually sells (e.g. "Red" under
   * "Color") — a deliberate customer choice, not the same thing as a
   * Batch (incidental manufacturing lot variation the customer never
   * chooses between). See the ProductVariant/Variation model comments in
   * schema.prisma for the full distinction. Only relevant for products
   * with a Variation attached, but this works regardless — the attached
   * Variation just controls whether the frontend shows variant selection
   * at all, and which values are available to pick from.
   */
  async getVariants(productId) {
    const variants = await prisma.productVariant.findMany({
      where: { product_id: productId, is_active: true },
      include: { stock_levels: true, variation_value: { include: { variation: true } } },
      orderBy: { variation_value: { value: 'asc' } },
    });
    const product = await prisma.product.findUnique({ where: { id: productId } });
    return variants.map((v) => this.variantToDTO(v, product));
  }

  async createVariant(productId, data) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      const err = new Error('Product not found');
      err.status = 404;
      throw err;
    }
    if (!product.variation_id) {
      const err = new Error('Attach a Variation to this product before adding values.');
      err.status = 400;
      throw err;
    }
    const variationValueId = data.variationValueId || data.variation_value_id;
    const value = await prisma.variationValue.findUnique({ where: { id: variationValueId } });
    if (!value || value.variation_id !== product.variation_id) {
      const err = new Error('That value does not belong to this product\'s Variation.');
      err.status = 400;
      throw err;
    }

    const warehouseId = await getDefaultWarehouseId();
    const initialStock = Number(data.stock ?? 0);
    // A variant's own cost, if given, otherwise it starts from the
    // product's base cost — either way, this only seeds the opening cost
    // lot; ongoing cost differences by value come from purchases scoped
    // to this variant, same as batch costing.
    const costPrice = data.cost_price !== undefined && data.cost_price !== '' ? Number(data.cost_price) : Number(product.cost_price);
    const priceOverride =
      data.priceOverride !== undefined && data.priceOverride !== null && data.priceOverride !== ''
        ? Number(data.priceOverride)
        : null;

    const variant = await prisma.productVariant.create({
      data: {
        product_id: productId,
        variation_value_id: variationValueId,
        sku: data.sku,
        price_override: priceOverride,
      },
    });

    if (initialStock > 0) {
      await prisma.stockLevel.create({
        data: { product_id: productId, variant_id: variant.id, warehouse_id: warehouseId, quantity: initialStock },
      });
      await prisma.stockMovement.create({
        data: {
          product_id: productId,
          variant_id: variant.id,
          warehouse_id: warehouseId,
          movement_type: 'STOCK_IN',
          quantity: initialStock,
          reference_note: 'Initial stock for new variant',
          created_by: data.created_by,
        },
      });
      await prisma.costLot.create({
        data: {
          product_id: productId,
          variant_id: variant.id,
          warehouse_id: warehouseId,
          unit_cost: costPrice,
          quantity_received: initialStock,
          quantity_remaining: initialStock,
        },
      });
    }

    const refreshedProduct = await prisma.product.findUnique({ where: { id: productId } });
    const full = await prisma.productVariant.findUnique({
      where: { id: variant.id },
      include: { stock_levels: true, variation_value: { include: { variation: true } } },
    });
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
      include: { stock_levels: true, variation_value: { include: { variation: true } } },
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
    await prisma.productVariant.delete({ where: { id: variantId } });
  }

  variantToDTO(variant, product) {
    const stock = (variant.stock_levels || []).reduce((sum, sl) => sum + Number(sl.quantity), 0);
    const value = variant.variation_value;
    const priceAdjustment =
      variant.price_override !== null && variant.price_override !== undefined
        ? Number(variant.price_override)
        : Number(value?.price_adjustment ?? 0);
    return {
      id: variant.id,
      productId: variant.product_id,
      variationValueId: variant.variation_value_id,
      // Display name — e.g. "Red" — sourced from the shared global value,
      // never stored redundantly on the variant itself.
      name: value?.value ?? '',
      variationName: value?.variation?.name ?? '',
      sku: variant.sku,
      priceOverride:
        variant.price_override !== null && variant.price_override !== undefined ? Number(variant.price_override) : null,
      priceAdjustment,
      // The actual sellable price for this specific value — base product
      // price plus its price adjustment (or override). Computed here so
      // the frontend never has to duplicate this math.
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
    // transfers, variants) has a RESTRICT foreign key back to this
    // product, so Postgres blocks the delete until those are cleared
    // first — there's no real history for any of them to lose here,
    // unlike invoices/purchases/kits above. All inside one transaction
    // so a partial cleanup can't happen.
    await prisma.$transaction(async (tx) => {
      await tx.stockTransfer.deleteMany({ where: { product_id: id } });
      await tx.stockMovement.deleteMany({ where: { product_id: id } });
      await tx.costLot.deleteMany({ where: { product_id: id } });
      await tx.stockLevel.deleteMany({ where: { product_id: id } });
      await tx.batch.deleteMany({ where: { product_id: id } });
      await tx.productVariant.deleteMany({ where: { product_id: id } });
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
      hsnCode: product.hsn_code,
      gstRate: Number(product.gst_rate),
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
      baseUom: product.base_uom,
      // FR: Flexible UoM Conversion — coveragePerBox (sq ft per box) powers
      // the Area-to-Box calculator; conversionFactor is a generic
      // base-units-per-alternate-unit ratio for LENGTH/BUNDLE products.
      coveragePerBox: product.coverage_per_box !== null && product.coverage_per_box !== undefined ? Number(product.coverage_per_box) : null,
      conversionFactor: product.conversion_factor !== null && product.conversion_factor !== undefined ? Number(product.conversion_factor) : null,
      // FR: Batch & Lot Tracking — when true, this product must be sold
      // from a specific batch (see GET /products/:id/batches).
      isBatchTracked: product.is_batch_tracked,
      // Variation attachment — a deliberate customer choice, distinct
      // from batch tracking (see GET /products/:id/variants). A product
      // can be both variant- and batch-tracked at once. `isVariantTracked`
      // is derived, not stored — true whenever a Variation is attached.
      variationId: product.variation_id,
      variationName: product.variation?.name || null,
      isVariantTracked: Boolean(product.variation_id),
      length: product.length !== null && product.length !== undefined ? Number(product.length) : null,
      width: product.width !== null && product.width !== undefined ? Number(product.width) : null,
      dimensionUnit: product.dimension_unit,
    };
  }
}

module.exports = new ProductsService();


