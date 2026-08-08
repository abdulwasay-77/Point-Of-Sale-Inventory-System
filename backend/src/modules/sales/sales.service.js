const prisma = require('../../config/db');
const { getDefaultWarehouseId } = require('../../utils/defaultWarehouse');
const { getWalkInCustomerId } = require('../../utils/walkInCustomer');
const { writeLedgerEntry } = require('../../utils/customerLedger');
const { getBusinessSettings } = require('../../utils/businessSettings');
const { toInvoiceDTO, INVOICE_INCLUDE_FOR_DTO } = require('../../utils/invoiceDto');

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
      include: INVOICE_INCLUDE_FOR_DTO,
      orderBy: { created_at: 'desc' },
    });
    return invoices.map(this.toDTO);
  }

  /**
   * Looks up the most recent batch a specific customer bought this exact
   * product (and variant, if applicable) — used at POS checkout to
   * pre-select the batch they got last time instead of leaving it to
   * memory/manual lookup, since for some product categories (e.g. paint,
   * tile, fabric) buying from the same lot again genuinely matters for a
   * consistent match. Deliberately customer-scoped: this has nothing to
   * do with FIFO/costing (see consumeCostLotsFifo above) — it's purely a
   * "what did *this* person get before" lookup, using the same batch_id
   * every invoice line already records.
   *
   * Returns null if this customer has never bought this product/variant
   * with a recorded batch before (e.g. their only purchase predates batch
   * tracking, or this is their first time).
   */
  async getCustomerLastBatch(customerId, productId, variantId = null) {
    const lastItem = await prisma.invoiceItem.findFirst({
      where: {
        product_id: productId,
        variant_id: variantId || null,
        batch_id: { not: null },
        invoice: { customer_id: customerId },
      },
      include: { invoice: { select: { created_at: true } }, batch: { select: { batch_number: true } } },
      orderBy: { invoice: { created_at: 'desc' } },
    });
    if (!lastItem) return null;

    const stockAgg = await prisma.stockLevel.aggregate({
      where: { batch_id: lastItem.batch_id },
      _sum: { quantity: true },
    });
    const stillInStock = Number(stockAgg._sum.quantity || 0) > 0;

    return {
      batchId: lastItem.batch_id,
      batchNumber: lastItem.batch.batch_number,
      purchasedAt: lastItem.invoice.created_at,
      stillInStock,
    };
  }

  async getById(id) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: INVOICE_INCLUDE_FOR_DTO,
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
  async checkout({ customerId, items, userId, warehouseId: requestedWarehouseId, paymentMethod, amountPaid, dueDate, installmentPlan }) {
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

    if (!customerId && (dueDate || installmentPlan)) {
      const err = new Error('Select a specific customer before starting a credit or installment sale — a walk-in sale has no one to collect the balance from later.');
      err.status = 400;
      throw err;
    }

    const productLines = items.filter((line) => line.productId);
    const kitLines = items.filter((line) => line.kitId);

    const products = await prisma.product.findMany({
      where: { id: { in: productLines.map((l) => l.productId) } },
      include: { stock_levels: { where: { warehouse_id: warehouseId } }, base_uom: true, variation_axes: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const variantIds = productLines.map((l) => l.variantId).filter(Boolean);
    const variants = variantIds.length > 0
      ? await prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          include: { values: { include: { variation_value: true } } },
        })
      : [];
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
      if (product.variation_axes.length > 0 && !line.variantId) {
        const err = new Error(`"${product.name}" has a variation attached — please select a value`);
        err.status = 400;
        throw err;
      }
      const available = product.is_batch_tracked || product.variation_axes.length > 0
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
      // A variant can cost more or less than the base product — e.g. a
      // premium value adds +200. That add-on normally comes from the SUM
      // of every value the variant combines (e.g. Color "Red" +0 AND
      // Size "Large" +200 stack to +200 together — see
      // ProductVariantValue in schema.prisma); a variant can optionally
      // override that entirely with its own price_override instead (see
      // the ProductVariant model comment in schema.prisma).
      const variantAdjustment = variant
        ? (variant.price_override !== null && variant.price_override !== undefined
            ? Number(variant.price_override)
            : (variant.values || []).reduce((sum, pv) => sum + Number(pv.variation_value?.price_adjustment ?? 0), 0))
        : 0;
      const unitPrice = baseUnitPrice + variantAdjustment;
      const grossLineTotal = quantity * unitPrice;
      const { discountType, discountValue, discountAmount } = resolveLineDiscount({
        grossLineTotal,
        quantity,
        product,
        overrideType: line.discountType,
        overrideValue: line.discountValue,
      });
      const lineTotal = grossLineTotal - discountAmount;
      const taxAmount = (lineTotal * Number(product.tax_rate)) / 100;
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
      // Kits are priced as a package — tax applied at the kit's own rate
      // isn't separately modeled, so kit lines are treated as already
      // GST-inclusive at checkout (no additional tax line added here).
      subtotal += lineTotal;
      return { kind: 'kit', kit, quantity, unitPrice, lineTotal };
    });

    // subtotal/cgst/sgst stay at full precision — that's what tax
    // reporting needs to stay accurate. The amount actually charged and
    // recorded on the invoice is rounded to the nearest whole rupee
    // (standard cash-rounding practice — nobody hands over 21 paisa in
    // change), so `roundedTotal` below, not `totalAmount`, is what gets
    // stored as total_amount. Before this fix, the raw unrounded
    // `totalAmount` was what actually got saved to the invoice — that
    // was the real bug behind odd totals like 6733.21 showing up.
    const totalAmount = subtotal + cgst + sgst;

    // Default paid amount to the exact (rounded) total when the client
    // doesn't send one (keeps older/other callers of this service
    // working unchanged).
    const roundedTotal = Math.round(totalAmount);
    const paidAmount = amountPaid === undefined || amountPaid === null ? roundedTotal : Number(amountPaid);
    if (Number.isNaN(paidAmount) || paidAmount < 0) {
      const err = new Error('Paid amount must be a valid positive number');
      err.status = 400;
      throw err;
    }
    // Round to avoid floating-point noise (e.g. 4999.999999999996) on
    // whatever was actually paid, before comparing against the total.
    const roundedPaid = Math.round(paidAmount * 100) / 100;

    // A sale can be paid in full, paid partially on credit (CustomerCredit
    // module — needs a due date), or paid partially as the down payment
    // on an installment plan (Installments module — needs a minimum %
    // enforced). Anything else paying less than the total is still
    // blocked outright, same as before this module existed.
    if (roundedPaid < roundedTotal) {
      if (installmentPlan) {
        const settings = await getBusinessSettings();
        const minPct = Number(settings.min_down_payment_pct);
        const minRequired = Math.round(roundedTotal * (minPct / 100) * 100) / 100;
        if (roundedPaid < minRequired) {
          const err = new Error(
            `Down payment must be at least ${minPct}% of the total (${minRequired.toFixed(2)}). Paid: ${roundedPaid.toFixed(2)}`,
          );
          err.status = 400;
          throw err;
        }
        if (!Number.isInteger(installmentPlan.installmentCount) || installmentPlan.installmentCount < 1) {
          const err = new Error('Installment count must be a whole number of 1 or more.');
          err.status = 400;
          throw err;
        }
      } else if (!dueDate) {
        const err = new Error(
          `Payment not processed: paid amount is less than the total due. Total: ${roundedTotal.toFixed(2)}, Paid: ${roundedPaid.toFixed(2)}. ` +
            `To accept a partial payment, set a due date (credit) or start an installment plan.`,
        );
        err.status = 400;
        throw err;
      } else if (Number.isNaN(new Date(dueDate).getTime())) {
        const err = new Error('Due date is not a valid date.');
        err.status = 400;
        throw err;
      }
    }
    const changeDue = Math.max(0, Math.round((roundedPaid - roundedTotal) * 100) / 100);
    const balanceDue = Math.max(0, Math.round((roundedTotal - roundedPaid) * 100) / 100);

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
          total_amount: roundedTotal,
          amount_paid: roundedPaid,
          balance_due: balanceDue,
          change_due: changeDue,
          due_date: balanceDue > 0 && !installmentPlan ? new Date(dueDate) : null,
          payment_method: resolvedPaymentMethod,
          status: 'COMPLETED',
          created_by: userId,
        },
      });

      if (balanceDue > 0) {
        await writeLedgerEntry(tx, {
          customerId: resolvedCustomerId,
          entryType: installmentPlan ? 'INSTALLMENT_SALE' : 'CREDIT_SALE',
          amount: balanceDue,
          invoiceId: created.id,
          description: `Invoice ${invoiceNumber} — ${roundedPaid.toFixed(2)} paid of ${roundedTotal.toFixed(2)}`,
          createdBy: userId,
        });
      }

      if (installmentPlan && balanceDue > 0) {
        // Remaining balance (after the down payment) is split evenly
        // across the installments — the last one absorbs any rounding
        // remainder so the schedule always sums to exactly balanceDue,
        // never a cent more or less.
        const count = installmentPlan.installmentCount;
        const perInstallment = Math.floor((balanceDue / count) * 100) / 100;
        const lastInstallment = Math.round((balanceDue - perInstallment * (count - 1)) * 100) / 100;
        const frequencyDays = Number(installmentPlan.frequencyDays) > 0 ? Number(installmentPlan.frequencyDays) : 30;

        const settings = await getBusinessSettings();
        const plan = await tx.installmentPlan.create({
          data: {
            invoice_id: created.id,
            customer_id: resolvedCustomerId,
            total_amount: roundedTotal,
            down_payment: roundedPaid,
            min_down_payment_pct: settings.min_down_payment_pct,
            installment_count: count,
            installment_amount: perInstallment,
            frequency_days: frequencyDays,
            created_by: userId,
          },
        });

        const scheduleRows = [];
        for (let i = 1; i <= count; i += 1) {
          const dueOn = new Date(created.created_at);
          dueOn.setDate(dueOn.getDate() + frequencyDays * i);
          scheduleRows.push({
            plan_id: plan.id,
            sequence: i,
            amount: i === count ? lastInstallment : perInstallment,
            due_date: dueOn,
          });
        }
        await tx.installmentPayment.createMany({ data: scheduleRows });
      }

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
            uom_used: line.product.base_uom?.abbreviation || line.product.base_uom?.name || 'unit',
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
            uom_used: 'unit',
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
        const commissionAmount = (roundedTotal * Number(employee.commission_rate)) / 100;
        await tx.commissionRecord.create({
          data: {
            employee_id: employee.id,
            invoice_id: created.id,
            sale_amount: roundedTotal,
            commission_rate: employee.commission_rate,
            commission_amount: commissionAmount,
          },
        });
      }

      return created;
    });

    return this.getById(invoice.id);
  }

  /**
   * Abandons a just-created sale that the cashier never actually
   * confirmed — i.e. checkout() already ran (so the invoice, stock
   * deductions etc. all exist), but the cashier closed the receipt
   * popup with the X instead of clicking "Done". From the cashier's
   * point of view nothing happened, so this fully undoes checkout's
   * writes rather than leaving a VOID-status audit trail: stock is
   * restored, and every row checkout created (invoice, items, payment,
   * ledger entry, installment plan/schedule, commission record) is
   * deleted outright. This is intentionally NOT a general "void any
   * past sale" feature (that's a bigger, separate admin capability —
   * see the unused InvoiceStatus.VOID / voided_at columns reserved for
   * it); it only ever fires immediately after an unconfirmed checkout,
   * which is why it's time-boxed to a few minutes below.
   */
  async abandon(id, userId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: { include: { kit: { include: { components: true } } } } },
    });
    if (!invoice) {
      const err = new Error('Invoice not found');
      err.status = 404;
      throw err;
    }

    const ageMs = Date.now() - new Date(invoice.created_at).getTime();
    const ABANDON_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
    if (ageMs > ABANDON_WINDOW_MS) {
      const err = new Error(
        'This sale can no longer be abandoned — closing the receipt popup only undoes checkout in the few minutes right after it happened.',
      );
      err.status = 409;
      throw err;
    }

    await prisma.$transaction(async (tx) => {
      const warehouseId = invoice.warehouse_id;

      for (const item of invoice.items) {
        if (item.product_id) {
          // Restore stock for a regular (non-kit) line.
          const level = item.variant_id || item.batch_id
            ? await tx.stockLevel.findFirst({
                where: {
                  product_id: item.product_id,
                  warehouse_id: warehouseId,
                  variant_id: item.variant_id || null,
                  batch_id: item.batch_id || null,
                },
              })
            : await tx.stockLevel.findFirst({ where: { product_id: item.product_id, warehouse_id: warehouseId } });

          if (level) {
            await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: { increment: item.quantity } } });
          } else {
            await tx.stockLevel.create({
              data: {
                product_id: item.product_id,
                warehouse_id: warehouseId,
                variant_id: item.variant_id || null,
                batch_id: item.batch_id || null,
                quantity: item.quantity,
              },
            });
          }

          await tx.stockMovement.create({
            data: {
              product_id: item.product_id,
              variant_id: item.variant_id,
              batch_id: item.batch_id,
              warehouse_id: warehouseId,
              movement_type: 'VOID_REVERSAL',
              quantity: item.quantity,
              reference_note: 'Checkout abandoned before confirmation',
              created_by: userId,
            },
          });

          // Re-add the exact cost basis this line consumed as a fresh
          // lot, rather than trying to trace back to the specific
          // original CostLot rows FIFO pulled from (not recorded
          // per-row) — this keeps total on-hand cost basis accurate
          // without needing that history.
          const quantity = Number(item.quantity);
          if (quantity > 0) {
            const unitCost = Number(item.cogs_amount) / quantity;
            await tx.costLot.create({
              data: {
                product_id: item.product_id,
                variant_id: item.variant_id || null,
                batch_id: item.batch_id || null,
                warehouse_id: warehouseId,
                unit_cost: Number.isFinite(unitCost) ? unitCost : 0,
                quantity_received: quantity,
                quantity_remaining: quantity,
              },
            });
          }
        } else if (item.kit_id && item.kit) {
          // Restore stock for each component of a kit/bundle line.
          for (const component of item.kit.components) {
            const totalToRestore = Number(component.quantity) * Number(item.quantity);
            const level = await tx.stockLevel.findFirst({
              where: { product_id: component.component_product_id, warehouse_id: warehouseId },
            });
            if (level) {
              await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: { increment: totalToRestore } } });
            } else {
              await tx.stockLevel.create({
                data: { product_id: component.component_product_id, warehouse_id: warehouseId, quantity: totalToRestore },
              });
            }
            await tx.stockMovement.create({
              data: {
                product_id: component.component_product_id,
                warehouse_id: warehouseId,
                movement_type: 'VOID_REVERSAL',
                quantity: totalToRestore,
                reference_note: `Kit component restored: ${item.kit.name} (checkout abandoned)`,
                created_by: userId,
              },
            });
          }
        }
      }

      // Delete in FK-dependency order: Payment can reference an
      // InstallmentPayment, which belongs to an InstallmentPlan, which
      // belongs to the Invoice — so children go first.
      await tx.payment.deleteMany({ where: { invoice_id: id } });
      await tx.installmentPayment.deleteMany({ where: { plan: { invoice_id: id } } });
      await tx.installmentPlan.deleteMany({ where: { invoice_id: id } });
      await tx.commissionRecord.deleteMany({ where: { invoice_id: id } });
      await tx.customerLedgerEntry.deleteMany({ where: { invoice_id: id } });
      await tx.invoiceItem.deleteMany({ where: { invoice_id: id } });
      await tx.invoice.delete({ where: { id } });
    });

    return { id, abandoned: true };
  }

  toDTO(invoice) {
    return toInvoiceDTO(invoice);
  }
}

module.exports = new SalesService();