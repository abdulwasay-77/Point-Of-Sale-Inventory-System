const prisma = require('../../config/db');
const { getDefaultWarehouseId } = require('../../utils/defaultWarehouse');
const ProductsService = require('../products/products.service');

class PurchasesService {
  async getAll() {
    const orders = await prisma.purchaseOrder.findMany({
      include: { supplier: true, warehouse: true, items: { include: { product: true } } },
      orderBy: { order_date: 'desc' },
    });
    return orders.map(this.toDTO);
  }

  async getById(id) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: true, warehouse: true, items: { include: { product: true } } },
    });
    if (!order) {
      const err = new Error('Purchase order not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(order);
  }

/**
 * Receiving stock. Three things beyond a plain "increase quantity":
 *  - FR: Batch & Lot Tracking — if a product is batch-tracked, each
 *    purchase line MUST identify a batch, either by supplying the id of
 *    one of the product's (or variant's) existing batches (line.batchId
 *    — just adds quantity + a new CostLot to it, no new Batch row is
 *    created) or by supplying a batchNumber for a brand new lot (created
 *    with the same uniqueness validation — scoped by product + variant —
 *    used everywhere else batches are created; see
 *    products.service.js#assertBatchNumberAvailable). This is what makes
 *    it possible to later sell a whole order from one lot, and what lets
 *    a depleted batch be topped back up by its own id rather than by
 *    retyping its batch number and hoping it matches.
 *  - FR: multi-location warehouse — stock is received into whichever
 *    warehouse is specified (defaults to the main store if omitted).
 *  - FIFO costing — every line opens a brand new CostLot at its own
 *    unit_cost. Nothing gets averaged into the product's existing cost,
 *    and stock is available for sale immediately at the current selling
 *    price, in full — the customer never sees "some at the old price,
 *    some at the new price". A sale later consumes these lots oldest-
 *    first purely to work out the true cost basis for margin reporting
 *    (see sales.service.js#consumeCostLotsFifo). If the product has a
 *    target_margin_pct set, this also returns a *suggested* retail/
 *    wholesale price based on the new cost — never applied automatically,
 *    the admin has to explicitly accept it (see suggestedPrices below).
 */
  async create(data) {
    const { supplierId, items, createdBy } = data;
    if (!supplierId || !Array.isArray(items) || items.length === 0) {
      const err = new Error('supplierId and at least one item are required');
      err.status = 400;
      throw err;
    }

    const warehouseId = data.warehouseId || (await getDefaultWarehouseId());
    const poNumber = `PO-${String(Date.now()).slice(-8)}`;

    const productIds = items.map((line) => line.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, include: { variation_axes: true } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate batch/variant info up front so we fail before writing
    // anything. A batch-tracked line needs EITHER an existing batchId
    // (restocking) OR a batchNumber for a brand new lot — never neither.
    for (const line of items) {
      const product = productMap.get(line.productId);
      if (!product) {
        const err = new Error(`Product ${line.productId} not found`);
        err.status = 404;
        throw err;
      }
      if (product.is_batch_tracked && !line.batchId && !line.batchNumber?.trim()) {
        const err = new Error(`"${product.name}" is batch-tracked — pick an existing batch or enter a new batch number for this line`);
        err.status = 400;
        throw err;
      }
      if (product.variation_axes.length > 0 && !line.variantId) {
        const err = new Error(`"${product.name}" has a variation attached — a value must be selected for this line`);
        err.status = 400;
        throw err;
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          po_number: poNumber,
          supplier_id: supplierId,
          warehouse_id: warehouseId,
          status: 'RECEIVED',
          received_date: new Date(),
          created_by: createdBy,
        },
      });

      let total = 0;
      for (const line of items) {
        const product = productMap.get(line.productId);
        const quantity = Number(line.quantity);
        const unitCost = Number(line.costPrice ?? line.unit_cost);
        total += quantity * unitCost;
        const variantId = line.variantId || null;

        let batchId = null;
        let batchNumberForRecord = null;

        if (product.is_batch_tracked) {
          if (line.batchId) {
            // Restocking an existing batch — top up its quantity, no new
            // Batch row. Scoped by product (and variant, if this batch
            // has one) so a stray/mismatched id can't silently write
            // against the wrong product's batch.
            const existingBatch = await tx.batch.findFirst({
              where: { id: line.batchId, product_id: line.productId, variant_id: variantId },
            });
            if (!existingBatch) {
              const err = new Error(`"${product.name}" — the selected batch no longer exists for this product/variant.`);
              err.status = 400;
              throw err;
            }
            batchId = existingBatch.id;
            batchNumberForRecord = existingBatch.batch_number;
          } else {
            // A genuinely new lot — same uniqueness validation as the
            // product-form opening-batch path (scoped by product +
            // variant, so two different variants may legitimately share
            // a batch number, but this exact variant/product may not
            // reuse one already in use).
            const batchNumber = await ProductsService.assertBatchNumberAvailable(
              line.productId,
              variantId,
              line.batchNumber,
            );
            const batch = await tx.batch.create({
              data: {
                product_id: line.productId,
                variant_id: variantId,
                batch_number: batchNumber,
                received_date: new Date(),
              },
            });
            batchId = batch.id;
            batchNumberForRecord = batch.batch_number;
          }
        }

        await tx.purchaseOrderItem.create({
          data: {
            purchase_order_id: po.id,
            product_id: line.productId,
            quantity_ordered: quantity,
            quantity_received: quantity,
            unit_cost: unitCost,
            batch_number: batchNumberForRecord,
          },
        });

        const existingLevel = await tx.stockLevel.findFirst({
          where: { product_id: line.productId, variant_id: variantId, warehouse_id: warehouseId, batch_id: batchId },
        });
        if (existingLevel) {
          await tx.stockLevel.update({ where: { id: existingLevel.id }, data: { quantity: { increment: quantity } } });
        } else {
          await tx.stockLevel.create({
            data: { product_id: line.productId, variant_id: variantId, batch_id: batchId, warehouse_id: warehouseId, quantity },
          });
        }

        await tx.stockMovement.create({
          data: {
            product_id: line.productId,
            variant_id: variantId,
            batch_id: batchId,
            warehouse_id: warehouseId,
            movement_type: 'STOCK_IN',
            quantity,
            purchase_order_id: po.id,
            created_by: createdBy,
          },
        });

        // FIFO cost lot — see the class-level doc comment above for why
        // this is a new lot rather than an average or overwrite. A
        // restock against an existing batch still opens its own new lot
        // at this purchase's cost, same as always — costing is never
        // blended, even within one batch.
        await tx.costLot.create({
          data: {
            product_id: line.productId,
            variant_id: variantId,
            batch_id: batchId,
            warehouse_id: warehouseId,
            purchase_order_id: po.id,
            unit_cost: unitCost,
            quantity_received: quantity,
            quantity_remaining: quantity,
          },
        });
      }

      const lastEntry = await tx.supplierLedgerEntry.findFirst({
        where: { supplier_id: supplierId },
        orderBy: { created_at: 'desc' },
      });
      const balanceAfter = (lastEntry ? Number(lastEntry.balance_after) : 0) + total;
      await tx.supplierLedgerEntry.create({
        data: {
          supplier_id: supplierId,
          entry_type: 'PURCHASE',
          amount: total,
          balance_after: balanceAfter,
          purchase_order_id: po.id,
          description: `Purchase order ${poNumber}`,
          created_by: createdBy,
        },
      });

      return po;
    });

    const suggestedPrices = this.computeSuggestedPrices(items, productMap);
    const dto = await this.getById(order.id);
    return { ...dto, suggestedPrices };
  }

  /**
   * Markup-on-cost formula (confirmed definition: target% is profit added
   * on top of cost, not a % of the selling price) — cost * (1 + markup/100).
   * Only returned when the product has a target_margin_pct set AND the
   * suggestion differs meaningfully (>1%) from the current price, so the
   * admin isn't nagged over rounding noise.
   */
  computeSuggestedPrices(items, productMap) {
    const suggestions = [];
    for (const line of items) {
      const product = productMap.get(line.productId);
      if (!product || product.target_margin_pct === null || product.target_margin_pct === undefined) continue;

      const marginPct = Number(product.target_margin_pct);
      if (marginPct <= 0) continue;

      const unitCost = Number(line.costPrice ?? line.unit_cost);
      const suggestedRetail = Math.round((unitCost * (1 + marginPct / 100)) * 100) / 100;
      const suggestedWholesale = suggestedRetail;

      const currentRetail = Number(product.retail_price);
      const currentWholesale = Number(product.wholesale_price);
      const retailDrift = currentRetail > 0 ? Math.abs(suggestedRetail - currentRetail) / currentRetail : 1;

      if (retailDrift > 0.01) {
        suggestions.push({
          productId: product.id,
          productName: product.name,
          newCost: unitCost,
          currentRetailPrice: currentRetail,
          suggestedRetailPrice: suggestedRetail,
          currentWholesalePrice: currentWholesale,
          suggestedWholesalePrice: suggestedWholesale,
          targetMarginPct: marginPct,
        });
      }
    }
    return suggestions;
  }

  toDTO(order) {
    return {
      id: order.id,
      poNumber: order.po_number,
      supplierId: order.supplier_id,
      supplier: order.supplier?.name,
      warehouseId: order.warehouse_id,
      warehouse: order.warehouse?.name,
      date: order.order_date,
      status: order.status,
      items: order.items.map((item) => ({
        productId: item.product_id,
        product: item.product?.name,
        quantity: Number(item.quantity_ordered),
        costPrice: Number(item.unit_cost),
        batchNumber: item.batch_number,
      })),
      total: order.items.reduce((sum, item) => sum + Number(item.quantity_ordered) * Number(item.unit_cost), 0),
    };
  }
}

module.exports = new PurchasesService();
