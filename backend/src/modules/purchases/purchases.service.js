
const prisma = require('../../config/db');
const { getDefaultWarehouseId } = require('../../utils/defaultWarehouse');

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
 *  - FR: Batch & Lot Tracking — if a product is batch-tracked (tiles,
 *    mainly), each purchase line MUST include a batchNumber (+ optional
 *    shadeCode). A new Batch row is created and the incoming stock is
 *    attributed to that specific batch, not pooled anonymously — this is
 *    what makes it possible to later sell a whole order from one shade.
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
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate batch/variant info up front so we fail before writing anything.
    for (const line of items) {
      const product = productMap.get(line.productId);
      if (!product) {
        const err = new Error(`Product ${line.productId} not found`);
        err.status = 404;
        throw err;
      }
      if (product.is_batch_tracked && !line.batchNumber?.trim()) {
        const err = new Error(`"${product.name}" is batch-tracked — a batch number is required for this line`);
        err.status = 400;
        throw err;
      }
      if (product.is_variant_tracked && !line.variantId) {
        const err = new Error(`"${product.name}" comes in multiple colors — a color must be selected for this line`);
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

        await tx.purchaseOrderItem.create({
          data: {
            purchase_order_id: po.id,
            product_id: line.productId,
            quantity_ordered: quantity,
            quantity_received: quantity,
            unit_cost: unitCost,
            batch_number: line.batchNumber || null,
            shade_code: line.shadeCode || null,
          },
        });

        const variantId = line.variantId || null;

        let batchId = null;
        if (product.is_batch_tracked) {
          const batch = await tx.batch.upsert({
            where: { product_id_batch_number: { product_id: line.productId, batch_number: line.batchNumber.trim() } },
            create: {
              product_id: line.productId,
              variant_id: variantId,
              batch_number: line.batchNumber.trim(),
              shade_code: line.shadeCode?.trim() || null,
              received_date: new Date(),
            },
            update: {},
          });
          batchId = batch.id;
        }

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
        // this is a new lot rather than an average or overwrite.
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
   * Margin-on-price formula (confirmed definition: margin% of the selling
   * price is profit, not markup on cost) — cost / (1 - margin/100). Only
   * returned when the product has a target_margin_pct set AND the
   * suggestion differs meaningfully (>1%) from the current price, so the
   * admin isn't nagged over rounding noise.
   */
  computeSuggestedPrices(items, productMap) {
    const suggestions = [];
    for (const line of items) {
      const product = productMap.get(line.productId);
      if (!product || product.target_margin_pct === null || product.target_margin_pct === undefined) continue;

      const marginPct = Number(product.target_margin_pct);
      if (marginPct <= 0 || marginPct >= 100) continue;

      const unitCost = Number(line.costPrice ?? line.unit_cost);
      const suggestedRetail = Math.round((unitCost / (1 - marginPct / 100)) * 100) / 100;
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
        shadeCode: item.shade_code,
      })),
      total: order.items.reduce((sum, item) => sum + Number(item.quantity_ordered) * Number(item.unit_cost), 0),
    };
  }
}

module.exports = new PurchasesService();
