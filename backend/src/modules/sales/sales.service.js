

const prisma = require('../../config/db');
const { getDefaultWarehouseId } = require('../../utils/defaultWarehouse');
const { getWalkInCustomerId } = require('../../utils/walkInCustomer');

// Payment methods selectable at the POS checkout screen (a subset of the
// full PaymentMethod enum — UPI/CREDIT are used elsewhere, e.g. ledgers,
// but aren't offered as a POS checkout option today).
const POS_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER'];

/**
 * Consumes CostLot rows oldest-first (FIFO) to work out the true cost
 * basis for a sold quantity, without ever blocking the sale or changing
 * what the customer is charged. If recorded lots run out before the full
 * quantity is covered (e.g. legacy stock from before this feature
 * existed), the remainder is costed at the product's current cost_price
 * so checkout never fails over a costing gap — margin reporting on that
 * sliver just falls back to being approximate instead of exact.
 */
async function consumeCostLotsFifo(tx, { productId, variantId, batchId, quantity, product }) {
  let remaining = quantity;
  let totalCost = 0;

  const lots = await tx.costLot.findMany({
    where: { product_id: productId, variant_id: variantId || null, batch_id: batchId || null, quantity_remaining: { gt: 0 } },
    orderBy: { created_at: 'asc' },
  });

  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = Number(lot.quantity_remaining);
    const take = Math.min(available, remaining);
    totalCost += take * Number(lot.unit_cost);
    remaining -= take;
    // eslint-disable-next-line no-await-in-loop
    await tx.costLot.update({ where: { id: lot.id }, data: { quantity_remaining: available - take } });
  }

  if (remaining > 0) {
    totalCost += remaining * Number(product.cost_price);
  }

  return totalCost;
}

/**
 * Resolves the discount actually applied to a cart line: an explicit
 * override from the cart (cashier changed it for this sale) takes
 * priority, otherwise the product's standing default discount is used.
 * FLAT is a per-unit amount (so it scales with quantity, same as price).
 */
function resolveLineDiscount({ grossLineTotal, quantity, product, overrideType, overrideValue }) {
  const discountType = overrideType === 'FLAT' || overrideType === 'PERCENTAGE' ? overrideType : product.discount_type;
  const discountValue = overrideValue !== undefined && overrideValue !== null && overrideValue !== '' ? Number(overrideValue) : Number(product.discount_value);

  let discountAmount = 0;
  if (discountType === 'PERCENTAGE') {
    discountAmount = (grossLineTotal * discountValue) / 100;
  } else {
    discountAmount = discountValue * quantity;
  }
  discountAmount = Math.max(0, Math.min(discountAmount, grossLineTotal));

  return { discountType, discountValue, discountAmount };
}

class SalesService {
  async getAll({ from, to } = {}) {
    const where = {
      ...(from || to
        ? {
            created_at: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    const invoices = await prisma.invoice.findMany({
      where,
      include: { customer: true, created_by_user: true, items: { include: { product: true, kit: true, variant: true, batch: true } } },
      orderBy: { created_at: 'desc' },
    });
    return invoices.map(this.toDTO);
  }

  async getById(id) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, created_by_user: true, items: { include: { product: true, kit: true, variant: true, batch: true } } },
    });
    if (!invoice) {
      const err = new Error('Invoice not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(invoice);
  }

  /**
   * Checkout. Each cart line is either:
   *   { productId, quantity, batchId? }  — a regular product. batchId is
   *     REQUIRED if the product is batch-tracked (FR: Batch & Lot Tracking
   *     — this is what actually lets a whole order come from one shade).
   *   { kitId, quantity }  — FR: Kitting & Bundling. Sold as one line at
   *     the kit's own price, but stock is deducted from each component
   *     product individually (component batches aren't selectable from
   *     the kit flow — see README for that tradeoff).
   *
   * Pricing (FR: wholesale/contractor billing): a customer whose
   * customer_type is WHOLESALE or CONTRACTOR is automatically billed at
   * wholesale_price instead of retail_price, on every product line.
   */
  async checkout({ customerId, items, userId, warehouseId: requestedWarehouseId, paymentMethod, amountPaid }) {
    if (!Array.isArray(items) || items.length === 0) {
      const err = new Error('At least one item is required to checkout');
      err.status = 400;
      throw err;
    }

    const resolvedPaymentMethod = paymentMethod || 'CASH';
    if (!POS_PAYMENT_METHODS.includes(resolvedPaymentMethod)) {
      const err = new Error(`Invalid payment method "${resolvedPaymentMethod}"`);
      err.status = 400;
      throw err;
    }

    const warehouseId = requestedWarehouseId || (await getDefaultWarehouseId());
    const resolvedCustomerId = customerId || (await getWalkInCustomerId());
    const customer = await prisma.customer.findUnique({ where: { id: resolvedCustomerId } });
    const useWholesalePricing = customer && ['WHOLESALE', 'CONTRACTOR'].includes(customer.customer_type);

    const productLines = items.filter((line) => line.productId);
    const kitLines = items.filter((line) => line.kitId);

    const products = await prisma.product.findMany({
      where: { id: { in: productLines.map((l) => l.productId) } },
      include: { stock_levels: { where: { warehouse_id: warehouseId } } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const variantIds = productLines.map((l) => l.variantId).filter(Boolean);
    const variants = variantIds.length > 0 ? await prisma.productVariant.findMany({ where: { id: { in: variantIds } } }) : [];
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    const kits = await prisma.kit.findMany({
      where: { id: { in: kitLines.map((l) => l.kitId) } },
      include: { components: { include: { component_product: true } } },
    });
    const kitMap = new Map(kits.map((k) => [k.id, k]));

    // ---- Validate everything up front so we fail before writing anything ----
    for (const line of productLines) {
      const product = productMap.get(line.productId);
      if (!product) {
        const err = new Error(`Product ${line.productId} not found`);
        err.status = 404;
        throw err;
      }
      if (product.is_batch_tracked && !line.batchId) {
        const err = new Error(`"${product.name}" is batch-tracked — please select a batch/shade`);
        err.status = 400;
        throw err;
      }
      if (product.is_variant_tracked && !line.variantId) {
        const err = new Error(`"${product.name}" comes in multiple colors — please select one`);
        err.status = 400;
        throw err;
      }
      const available = product.is_batch_tracked || product.is_variant_tracked
        ? Number((await prisma.stockLevel.findFirst({
            where: {
              product_id: product.id,
              warehouse_id: warehouseId,
              variant_id: line.variantId || null,
              batch_id: line.batchId || null,
            },
          }))?.quantity || 0)
        : product.stock_levels.reduce((sum, sl) => sum + Number(sl.quantity), 0);
      if (available < Number(line.quantity)) {
        const err = new Error(`Insufficient stock for ${product.name}. Available: ${available}`);
        err.status = 409;
        throw err;
      }
    }

    const componentAvailability = new Map(); // productId -> available qty (aggregated, checked cumulatively below)
    for (const line of kitLines) {
      const kit = kitMap.get(line.kitId);
      if (!kit) {
        const err = new Error(`Kit ${line.kitId} not found`);
        err.status = 404;
        throw err;
      }
      for (const component of kit.components) {
        const neededPerKit = Number(component.quantity);
        const totalNeeded = neededPerKit * Number(line.quantity);
        const key = component.component_product_id;
        const alreadyCounted = componentAvailability.get(key) || 0;
        componentAvailability.set(key, alreadyCounted + totalNeeded);
      }
    }
    for (const [productId, totalNeeded] of componentAvailability.entries()) {
      const levels = await prisma.stockLevel.findMany({ where: { product_id: productId, warehouse_id: warehouseId } });
      const available = levels.reduce((sum, sl) => sum + Number(sl.quantity), 0);
      if (available < totalNeeded) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        const err = new Error(`Insufficient stock for kit component "${product?.name}". Available: ${available}, needed: ${totalNeeded}`);
        err.status = 409;
        throw err;
      }
    }

    const invoiceCount = await prisma.invoice.count();
    const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(5, '0')}`;

    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let totalDiscount = 0;

    const productLineData = productLines.map((line) => {
      const product = productMap.get(line.productId);
      const variant = line.variantId ? variantMap.get(line.variantId) : null;
      const quantity = Number(line.quantity);
      const baseUnitPrice = useWholesalePricing ? Number(product.wholesale_price) : Number(product.retail_price);
      // A variant (color) can cost more or less than the base product —
      // e.g. a premium color adds +200. Applied on top of retail/
      // wholesale, same adjustment either way.
      const unitPrice = baseUnitPrice + (variant ? Number(variant.price_adjustment) : 0);
      const grossLineTotal = quantity * unitPrice;
      const { discountType, discountValue, discountAmount } = resolveLineDiscount({
        grossLineTotal,
        quantity,
        product,
        overrideType: line.discountType,
        overrideValue: line.discountValue,
      });
      const lineTotal = grossLineTotal - discountAmount;
      const taxAmount = (lineTotal * Number(product.gst_rate)) / 100;
      subtotal += lineTotal;
      cgst += taxAmount / 2;
      sgst += taxAmount / 2;
      totalDiscount += discountAmount;
      return {
        kind: 'product',
        product,
        quantity,
        unitPrice,
        lineTotal,
        discountType,
        discountValue,
        discountAmount,
        variantId: line.variantId || null,
        batchId: line.batchId || null,
      };
    });

    const kitLineData = kitLines.map((line) => {
      const kit = kitMap.get(line.kitId);
      const quantity = Number(line.quantity);
      const unitPrice = Number(kit.kit_price);
      const lineTotal = quantity * unitPrice;
      // Kits are priced as a package — GST applied at the kit's own rate
      // isn't separately modeled, so kit lines are treated as already
      // GST-inclusive at checkout (no additional tax line added here).
      subtotal += lineTotal;
      return { kind: 'kit', kit, quantity, unitPrice, lineTotal };
    });

    const totalAmount = subtotal + cgst + sgst;

    // Default paid amount to the exact total when the client doesn't send
    // one (keeps older/other callers of this service working unchanged).
    const paidAmount = amountPaid === undefined || amountPaid === null ? totalAmount : Number(amountPaid);
    if (Number.isNaN(paidAmount) || paidAmount < 0) {
      const err = new Error('Paid amount must be a valid positive number');
      err.status = 400;
      throw err;
    }
    // Round to avoid floating-point noise (e.g. 25999.999999999996) before
    // comparing against the total.
    const roundedTotal = Math.round(totalAmount * 100) / 100;
    const roundedPaid = Math.round(paidAmount * 100) / 100;
    if (roundedPaid < roundedTotal) {
      const err = new Error(
        `Payment not processed: paid amount is less than the total due. Total: ${roundedTotal.toFixed(2)}, Paid: ${roundedPaid.toFixed(2)}`,
      );
      err.status = 400;
      throw err;
    }
    const changeDue = Math.round((roundedPaid - roundedTotal) * 100) / 100;

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoice_number: invoiceNumber,
          customer_id: resolvedCustomerId,
          warehouse_id: warehouseId,
          subtotal,
          cgst,
          sgst,
          discount: totalDiscount,
          total_amount: totalAmount,
          amount_paid: roundedPaid,
          balance_due: 0,
          change_due: changeDue,
          payment_method: resolvedPaymentMethod,
          status: 'COMPLETED',
          created_by: userId,
        },
      });

      for (const line of productLineData) {
        const cogsAmount = await consumeCostLotsFifo(tx, {
          productId: line.product.id,
          variantId: line.variantId,
          batchId: line.batchId,
          quantity: line.quantity,
          product: line.product,
        });

        await tx.invoiceItem.create({
          data: {
            invoice_id: created.id,
            product_id: line.product.id,
            variant_id: line.variantId,
            batch_id: line.batchId,
            quantity: line.quantity,
            uom_used: line.product.base_uom,
            unit_price: line.unitPrice,
            discount_type: line.discountType,
            discount_value: line.discountValue,
            discount_amount: line.discountAmount,
            line_total: line.lineTotal,
            cogs_amount: cogsAmount,
          },
        });

        const level = line.variantId || line.batchId
          ? await tx.stockLevel.findFirst({
              where: { product_id: line.product.id, warehouse_id: warehouseId, variant_id: line.variantId || null, batch_id: line.batchId || null },
            })
          : await tx.stockLevel.findFirst({ where: { product_id: line.product.id, warehouse_id: warehouseId }, orderBy: { quantity: 'desc' } });

        await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: { decrement: line.quantity } } });

        await tx.stockMovement.create({
          data: {
            product_id: line.product.id,
            variant_id: line.variantId,
            batch_id: line.batchId,
            warehouse_id: warehouseId,
            movement_type: 'SALE',
            quantity: -line.quantity,
            invoice_id: created.id,
            created_by: userId,
          },
        });
      }

      for (const line of kitLineData) {
        await tx.invoiceItem.create({
          data: {
            invoice_id: created.id,
            kit_id: line.kit.id,
            quantity: line.quantity,
            uom_used: 'PIECE',
            unit_price: line.unitPrice,
            line_total: line.lineTotal,
          },
        });

        // FR: Kitting & Bundling — deduct each component individually.
        for (const component of line.kit.components) {
          const totalNeeded = Number(component.quantity) * line.quantity;
          const level = await tx.stockLevel.findFirst({
            where: { product_id: component.component_product_id, warehouse_id: warehouseId },
            orderBy: { quantity: 'desc' },
          });
          await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: { decrement: totalNeeded } } });
          await tx.stockMovement.create({
            data: {
              product_id: component.component_product_id,
              warehouse_id: warehouseId,
              movement_type: 'SALE',
              quantity: -totalNeeded,
              invoice_id: created.id,
              reference_note: `Kit component: ${line.kit.name}`,
              created_by: userId,
            },
          });
        }
      }

      await tx.payment.create({
        data: {
          invoice_id: created.id,
          customer_id: resolvedCustomerId,
          amount: roundedPaid,
          method: resolvedPaymentMethod,
          created_by: userId,
        },
      });

      const employee = await tx.employee.findUnique({ where: { user_id: userId } });
      if (employee?.commission_rate) {
        const commissionAmount = (totalAmount * Number(employee.commission_rate)) / 100;
        await tx.commissionRecord.create({
          data: {
            employee_id: employee.id,
            invoice_id: created.id,
            sale_amount: totalAmount,
            commission_rate: employee.commission_rate,
            commission_amount: commissionAmount,
          },
        });
      }

      return created;
    });

    return this.getById(invoice.id);
  }

  toDTO(invoice) {
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      customerId: invoice.customer_id,
      customer: invoice.customer?.name || 'Walk-in Customer',
      date: invoice.created_at,
      cashier: invoice.created_by_user?.name || 'Unknown',
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      cgst: Number(invoice.cgst),
      sgst: Number(invoice.sgst),
      total: Number(invoice.total_amount),
      paymentMethod: invoice.payment_method,
      amountPaid: Number(invoice.amount_paid),
      changeDue: Number(invoice.change_due),
      status: invoice.status,
      items: invoice.items.map((item) => ({
        productId: item.product_id,
        kitId: item.kit_id,
        product: item.product?.name || item.kit?.name || 'Item',
        variant: item.variant?.variant_name || null,
        batch: item.batch ? `${item.batch.batch_number}${item.batch.shade_code ? ` (${item.batch.shade_code})` : ''}` : null,
        quantity: Number(item.quantity),
        price: Number(item.unit_price),
        discountType: item.discount_type,
        discountValue: Number(item.discount_value),
        discountAmount: Number(item.discount_amount),
        lineTotal: Number(item.line_total),
        cogsAmount: Number(item.cogs_amount),
        margin: Number(item.line_total) - Number(item.cogs_amount),
      })),
    };
  }
}

module.exports = new SalesService();
