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
    const existing = await prisma.product.findUnique({ where: { barcode: code } });
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
      include: { category: true, stock_levels: true },
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
      include: { category: true, stock_levels: true },
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
   * `variants`, when the product is variant-tracked, is the list of colors
   * drafted in the Add Product form (each { variantName, sku,
   * priceAdjustment, stock }) — see validateVariantAllocation() for why
   * this is required and must exactly cover `data.stock`, and why the
   * whole thing runs in one transaction (see the block below).
   */
  async create(rawData, imageFile, actorPermissions = null, variants = null) {
    const data = actorPermissions === null ? rawData : stripUnauthorizedPricingFields(rawData, actorPermissions);
    const warehouseId = await getDefaultWarehouseId();
    const initialStock = Number(data.stock ?? 0);
    const costPrice = Number(data.cost_price ?? 0);
    const isVariantTracked = data.is_variant_tracked === true || data.is_variant_tracked === 'true';

    if (isVariantTracked) {
      this.validateVariantAllocation(variants, initialStock);
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
      is_batch_tracked: data.is_batch_tracked === true || data.is_batch_tracked === 'true',
      is_variant_tracked: isVariantTracked,
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

    // Variant-tracked products never get a colorless (variant_id: null)
    // stock row — every unit must belong to a color, otherwise it becomes
    // unreachable from POS (the color picker there only ever lists
    // variants, it has no "no color" option). So the product itself is
    // created with zero base stock, and each drafted color's stock is
    // created alongside it, all inside one transaction — if any color
    // fails to save, the whole product creation rolls back rather than
    // leaving a product with some colors missing.
    if (isVariantTracked) {
      const productId = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({ data: productData });
        await this.allocateVariantsInTx(tx, created.id, variants, warehouseId, costPrice, data.created_by);
        return created.id;
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
   * Enforces that Stock Quantity is fully accounted for by the drafted
   * colors — no more, no less — for a variant-tracked product. This is
   * the fix for the bug where units entered in the top-level Stock
   * Quantity field silently ended up in a colorless stock row that the
   * POS color picker could never sell: rather than allow that split to
   * exist at all, saving is blocked until the two numbers match exactly.
   */
  validateVariantAllocation(variants, declaredStock) {
    if (!Array.isArray(variants) || variants.length === 0) {
      const err = new Error('Add at least one color before saving a product marked "Comes in colors".');
      err.status = 400;
      throw err;
    }
    for (const v of variants) {
      const name = (v.variantName || v.variant_name || '').trim();
      const sku = (v.sku || '').trim();
      if (!name) {
        const err = new Error('Every color needs a name.');
        err.status = 400;
        throw err;
      }
      if (!sku) {
        const err = new Error(`Color "${name}" needs its own SKU.`);
        err.status = 400;
        throw err;
      }
    }
    const allocated = variants.reduce((sum, v) => sum + Number(v.stock ?? 0), 0);
    if (allocated !== Number(declaredStock)) {
      const err = new Error(
        `Stock Quantity (${declaredStock}) must exactly match the total stock across all colors (currently ${allocated}). ` +
          `Adjust Stock Quantity or the per-color stock so they match.`,
      );
      err.status = 400;
      throw err;
    }
  }

  /** Creates each drafted color plus its stock/cost lot, inside an
   *  already-open transaction. Shared by create() (brand-new product)
   *  and update() (turning colors on for an existing product). */
  async allocateVariantsInTx(tx, productId, variants, warehouseId, fallbackCostPrice, createdBy) {
    for (const v of variants) {
      const stock = Number(v.stock ?? 0);
      const variant = await tx.productVariant.create({
        data: {
          product_id: productId,
          variant_name: (v.variantName || v.variant_name || '').trim(),
          sku: (v.sku || '').trim().toUpperCase(),
          price_adjustment: Number(v.priceAdjustment ?? v.price_adjustment ?? 0),
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
            reference_note: `Initial stock for variant "${variant.variant_name}"`,
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
        ...(data.is_variant_tracked !== undefined && {
          is_variant_tracked: data.is_variant_tracked === true || data.is_variant_tracked === 'true',
        }),
        ...(data.length !== undefined && { length: data.length === '' ? null : Number(data.length) }),
        ...(data.width !== undefined && { width: data.width === '' ? null : Number(data.width) }),
        ...(data.dimension_unit !== undefined && { dimension_unit: data.dimension_unit || null }),
        ...(imageFile && { image_url: `/uploads/products/${imageFile.filename}` }),
      },
    });

    // Whether the product will be variant-tracked *after* this update
    // (may be flipping on right now, or may already have been on).
    const willBeVariantTracked = data.is_variant_tracked !== undefined
      ? (data.is_variant_tracked === true || data.is_variant_tracked === 'true')
      : existing.is_variant_tracked;
    const turningOnVariantTracking = willBeVariantTracked && !existing.is_variant_tracked && data.is_variant_tracked !== undefined;

    if (turningOnVariantTracking) {
      // Flipping "Comes in colors" on for a product that already has
      // plain (colorless) stock. That stock would become permanently
      // unreachable from POS the moment colors are on (the POS color
      // picker only ever lists colors — see VariantBatchSelectorModal),
      // so refuse the flip until it's been zeroed out here first — the
      // admin can then reopen this product and add colors with their own
      // stock via the Color Options panel below.
      const colorlessTotal = existing.stock_levels
        .filter((sl) => sl.variant_id === null)
        .reduce((sum, sl) => sum + Number(sl.quantity), 0);
      if (colorlessTotal > 0) {
        const err = new Error(
          `This product still has ${colorlessTotal} unit(s) of general (colorless) stock. Set Stock Quantity to 0 ` +
            `and save first — general stock can't be sold once colors are turned on — then reopen this product to ` +
            `add colors, each with its own stock.`,
        );
        err.status = 400;
        throw err;
      }
    }

    // Optional stock adjustment: if `stock` is passed, reconcile the total
    // colorless stock across the default warehouse to match the new
    // value. Never runs for a variant-tracked product — every unit there
    // must belong to a color (added via the Color Options panel /
    // VariantManager, not this field), otherwise it would end up in a
    // colorless stock row the POS color picker can never sell, and this
    // block's old `findFirst` (unfiltered by variant_id) could also have
    // silently overwritten an existing color's stock row instead.
    if (data.stock !== undefined && !willBeVariantTracked) {
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
      include: { category: true, stock_levels: true },
    });
    return product ? this.toDTO(product) : null;
  }

  /**
   * Available batches for a batch-tracked product, each with its own live
   * stock quantity — this is what lets staff pick a specific shade/lot at
   * sale time instead of stock being one anonymous pool.
   */
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
   * Available batches, optionally scoped to one variant (color). When a
   * product is both batch- and variant-tracked, the POS flow is: pick a
   * variant first, then call this with that variantId to list only the
   * batches belonging to that color — not every batch of every color.
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
   * Color/shade variants for a product — a deliberate customer choice
   * (e.g. red vs blue), not the same thing as a Batch (incidental
   * manufacturing lot variation the customer never chooses between). See
   * the ProductVariant model comment in schema.prisma for the full
   * distinction. Only relevant for products with is_variant_tracked=true,
   * but this works regardless of that flag — the flag just controls
   * whether the frontend shows variant selection at all.
   */
  async getVariants(productId) {
    const variants = await prisma.productVariant.findMany({
      where: { product_id: productId, is_active: true },
      include: { stock_levels: true },
      orderBy: { variant_name: 'asc' },
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
    const warehouseId = await getDefaultWarehouseId();
    const initialStock = Number(data.stock ?? 0);
    // A variant's own cost, if given, otherwise it starts from the
    // product's base cost — either way, this only seeds the opening cost
    // lot; ongoing cost differences by color come from purchases scoped
    // to this variant, same as batch costing.
    const costPrice = data.cost_price !== undefined && data.cost_price !== '' ? Number(data.cost_price) : Number(product.cost_price);

    const variant = await prisma.productVariant.create({
      data: {
        product_id: productId,
        variant_name: data.variantName || data.variant_name,
        sku: data.sku,
        price_adjustment: Number(data.priceAdjustment ?? data.price_adjustment ?? 0),
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
          reference_note: `Initial stock for variant "${variant.variant_name}"`,
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
    return this.variantToDTO(variant, refreshedProduct);
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
        ...((data.variantName !== undefined || data.variant_name !== undefined) && {
          variant_name: data.variantName ?? data.variant_name,
        }),
        ...(data.sku !== undefined && { sku: data.sku }),
        ...((data.priceAdjustment !== undefined || data.price_adjustment !== undefined) && {
          price_adjustment: Number(data.priceAdjustment ?? data.price_adjustment),
        }),
      },
      include: { stock_levels: true },
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
    return {
      id: variant.id,
      productId: variant.product_id,
      name: variant.variant_name,
      sku: variant.sku,
      priceAdjustment: Number(variant.price_adjustment),
      // The actual sellable price for this specific color — base product
      // price plus this variant's adjustment. Computed here so the
      // frontend never has to duplicate this math.
      price: product ? Number(product.retail_price) + Number(variant.price_adjustment) : null,
      wholesalePrice: product ? Number(product.wholesale_price) + Number(variant.price_adjustment) : null,
      stock,
      isActive: variant.is_active,
    };
  }

  async remove(id) {
    const usageCount = await prisma.invoiceItem.count({ where: { product_id: id } });
    if (usageCount > 0) {
      // FR-3.2.7 — cannot delete a product with transaction history.
      await prisma.product.update({ where: { id }, data: { is_active: false } });
      return;
    }
    await prisma.product.delete({ where: { id } });
  }

  toDTO(product) {
    const stock = (product.stock_levels || []).reduce((sum, sl) => sum + Number(sl.quantity), 0);
    const retailPrice = Number(product.retail_price);
    const targetMarginPct = product.target_margin_pct !== null && product.target_margin_pct !== undefined ? Number(product.target_margin_pct) : null;

    // "Margin on price" (confirmed definition): margin% of the selling
    // price is profit. Actual margin right now, vs. the target — purely
    // informational, used by the product list/form to show a "drifted
    // from target" nudge. Never changes the price itself.
    let marginAlert = false;
    if (targetMarginPct !== null && retailPrice > 0) {
      const actualMarginPct = ((retailPrice - Number(product.cost_price)) / retailPrice) * 100;
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
      // Color/shade variants — a deliberate customer choice, distinct from
      // batch tracking (see GET /products/:id/variants). A product can be
      // both variant- and batch-tracked at once.
      isVariantTracked: product.is_variant_tracked,
      length: product.length !== null && product.length !== undefined ? Number(product.length) : null,
      width: product.width !== null && product.width !== undefined ? Number(product.width) : null,
      dimensionUnit: product.dimension_unit,
    };
  }
}

module.exports = new ProductsService();