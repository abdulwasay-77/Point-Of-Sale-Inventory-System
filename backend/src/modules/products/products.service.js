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
   */
  async create(rawData, imageFile, actorPermissions = null) {
    const data = actorPermissions === null ? rawData : stripUnauthorizedPricingFields(rawData, actorPermissions);
    const warehouseId = await getDefaultWarehouseId();
    const initialStock = Number(data.stock ?? 0);
    const costPrice = Number(data.cost_price ?? 0);

    // Barcode: if the admin didn't scan/type one in, generate one from the
    // SKU (Code128 can encode letters/numbers/dashes, so the SKU itself is
    // a valid barcode value — no separate counter needed, and it's always
    // immediately printable/scannable the moment the product exists).
    const barcode = data.barcode?.trim() || data.sku?.trim() || null;

    const product = await prisma.product.create({
      data: {
        name: data.name,
        sku: data.sku,
        category_id: data.categoryId || data.category_id || null,
        brand: data.brand || null,
        base_uom: data.base_uom || 'PIECE',
        coverage_per_box: data.coverage_per_box !== undefined && data.coverage_per_box !== '' ? Number(data.coverage_per_box) : null,
        conversion_factor: data.conversion_factor !== undefined && data.conversion_factor !== '' ? Number(data.conversion_factor) : null,
        is_batch_tracked: data.is_batch_tracked === true || data.is_batch_tracked === 'true',
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
      },
    });

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
        ...(imageFile && { image_url: `/uploads/products/${imageFile.filename}` }),
      },
    });

    // Optional stock adjustment: if `stock` is passed, reconcile the total
    // stock across the default warehouse to match the new value.
    if (data.stock !== undefined) {
      const warehouseId = await getDefaultWarehouseId();
      const currentTotal = existing.stock_levels.reduce((sum, sl) => sum + Number(sl.quantity), 0);
      const target = Number(data.stock);
      const delta = target - currentTotal;

      if (delta !== 0) {
        const level = await prisma.stockLevel.findFirst({
          where: { product_id: id, warehouse_id: warehouseId, batch_id: null },
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
  async getBatches(productId) {
    const batches = await prisma.batch.findMany({
      where: { product_id: productId },
      include: { stock_levels: true },
      orderBy: { received_date: 'asc' },
    });
    return batches
      .map((b) => ({
        id: b.id,
        batchNumber: b.batch_number,
        shadeCode: b.shade_code,
        receivedDate: b.received_date,
        stock: b.stock_levels.reduce((sum, sl) => sum + Number(sl.quantity), 0),
      }))
      .filter((b) => b.stock > 0);
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
    };
  }
}

module.exports = new ProductsService();
