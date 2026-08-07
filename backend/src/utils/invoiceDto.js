/**
 * Shared invoice/payment DTO shaping for receipts.
 *
 * A sub-receipt is NOT a separate stored entity — it's just a rendering of
 * one `Payment` row scoped back to its parent Invoice. Every payment ever
 * applied to an invoice (the checkout payment, a later credit top-up, a
 * scheduled installment) already lives in the `Payment` table with its own
 * amount/date/method and a frozen `balance_after` snapshot, so there is
 * nothing else to build or reconcile — this file just turns that existing
 * data into the shape the frontend receipt components expect.
 *
 * Numbering: the first payment chronologically on an invoice (almost
 * always the one created at checkout) IS the main receipt — it doesn't get
 * its own sub-receipt number. Every payment after that is numbered off the
 * invoice number: INV-00007-R2, INV-00007-R3, etc. — "R" for "receipt",
 * so it's visually obvious it's a follow-on slip tied back to the original,
 * not a new invoice.
 *
 * Used by sales.service.js (checkout + listing), credit.service.js
 * (recording a later payment), and installments.service.js (marking a
 * scheduled installment paid) — one source of truth so all three render
 * identically instead of drifting apart.
 */

function computeSaleType(invoice) {
  if (invoice.installment_plan) return 'INSTALLMENT';
  if (Number(invoice.balance_due) > 0) return 'CREDIT';
  return 'FULL';
}

function paymentLabel(payment, index) {
  if (payment.installment_payment_id) {
    return `Installment #${payment.installment_payment?.sequence ?? ''}`.trim();
  }
  if (index === 0) return 'Initial Payment';
  return 'Credit Payment';
}

function toPaymentDTO(payment, invoiceNumber, index) {
  return {
    id: payment.id,
    invoiceId: payment.invoice_id,
    invoiceNumber,
    amount: Number(payment.amount),
    // Change handed back when this payment was tendered for more than
    // was actually due (see CreditService#recordPayment) — 0 for a
    // normal payment. `amount` above is always net of this, so
    // amount + changeDue is what the customer actually handed over.
    changeDue: payment.change_due !== null && payment.change_due !== undefined ? Number(payment.change_due) : 0,
    method: payment.method,
    paymentDate: payment.payment_date,
    referenceNo: payment.reference_no,
    balanceAfter: payment.balance_after !== null && payment.balance_after !== undefined ? Number(payment.balance_after) : null,
    isInstallment: Boolean(payment.installment_payment_id),
    installmentSequence: payment.installment_payment?.sequence || null,
    label: paymentLabel(payment, index),
    // Index 0 (the checkout payment) IS the main receipt — no separate
    // receipt number, isSubReceipt stays false. Everything after that is a
    // sub-receipt of the original.
    isSubReceipt: index > 0,
    receiptNumber: index === 0 ? invoiceNumber : `${invoiceNumber}-R${index + 1}`,
  };
}

/**
 * invoice must already be loaded with: customer, created_by_user, items
 * (with product/kit/variant.values.variation_value/batch), payments
 * (with installment_payment), installment_plan — see
 * INVOICE_INCLUDE_FOR_DTO below.
 */
function toInvoiceDTO(invoice) {
  const sortedPayments = (invoice.payments || [])
    .slice()
    .sort((a, b) => new Date(a.payment_date) - new Date(b.payment_date));
  const payments = sortedPayments.map((p, i) => toPaymentDTO(p, invoice.invoice_number, i));
  const saleType = computeSaleType(invoice);

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    invoiceType: invoice.invoice_type,
    relatedInvoiceId: invoice.related_invoice_id,
    customerId: invoice.customer_id,
    customer: invoice.customer?.name || 'Walk-in Customer',
    customerPhone: invoice.customer?.contact_phone || null,
    date: invoice.created_at,
    cashier: invoice.created_by_user?.name || 'Unknown',
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    cgst: Number(invoice.cgst),
    sgst: Number(invoice.sgst),
    total: Number(invoice.total_amount),
    paymentMethod: invoice.payment_method,
    amountPaid: Number(invoice.amount_paid),
    balanceDue: Number(invoice.balance_due),
    changeDue: Number(invoice.change_due),
    dueDate: invoice.due_date,
    status: invoice.status,
    saleType,
    items: (invoice.items || []).map((item) => ({
      productId: item.product_id,
      kitId: item.kit_id,
      product: item.product?.name || item.kit?.name || 'Item',
      variant: (item.variant?.values || []).map((pv) => pv.variation_value?.value).filter(Boolean).join(' / ') || null,
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
    installmentPlan: invoice.installment_plan
      ? {
          id: invoice.installment_plan.id,
          downPayment: Number(invoice.installment_plan.down_payment),
          installmentCount: invoice.installment_plan.installment_count,
          installmentAmount: Number(invoice.installment_plan.installment_amount),
          frequencyDays: invoice.installment_plan.frequency_days,
          status: invoice.installment_plan.status,
        }
      : null,
    payments,
  };
}

// Standard include shape needed for toInvoiceDTO — kept here so every
// caller stays in sync with what the DTO actually reads.
const INVOICE_INCLUDE_FOR_DTO = {
  customer: true,
  created_by_user: true,
  items: { include: { product: true, kit: true, variant: { include: { values: { include: { variation_value: true } } } }, batch: true } },
  payments: { include: { installment_payment: true } },
  installment_plan: true,
};

module.exports = { toInvoiceDTO, toPaymentDTO, computeSaleType, INVOICE_INCLUDE_FOR_DTO };