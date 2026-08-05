const prisma = require('../../config/db');
const { writeLedgerEntry } = require('../../utils/customerLedger');
const { toInvoiceDTO, INVOICE_INCLUDE_FOR_DTO } = require('../../utils/invoiceDto');

/**
 * CustomerCredit — a view over invoices that still have balance_due > 0
 * (from a partial payment at checkout — see sales.service.js#checkout),
 * plus the two actions an admin takes against them: recording a payment,
 * and charging a late fee. There's no separate "credit record" table;
 * the invoice itself already carries paid/due/due_date, so this module
 * reads and acts on that directly rather than duplicating it.
 */
class CreditService {
  async getOutstanding() {
    const invoices = await prisma.invoice.findMany({
      where: { balance_due: { gt: 0 }, voided_at: null },
      include: { customer: true },
      orderBy: { due_date: 'asc' },
    });
    const now = new Date();
    return invoices.map((inv) => this.toDTO(inv, now));
  }

  /**
   * Every invoice that was ever a CREDIT_SALE — whether it's still
   * outstanding or has since been fully paid off. getOutstanding() above
   * only shows balance_due > 0, so a paid-off credit sale quietly
   * disappears from that view; this is the durable record of "this
   * customer bought on credit," identified via the ledger trail written
   * at checkout (see sales.service.js) rather than a separate table —
   * same "the invoice + ledger already are the record" approach as the
   * rest of this module. Installment sales have their own dedicated
   * history on the Installments page and are deliberately excluded here.
   */
  async getHistory() {
    const ledgerEntries = await prisma.customerLedgerEntry.findMany({
      where: { entry_type: 'CREDIT_SALE' },
      select: { invoice_id: true },
      distinct: ['invoice_id'],
    });
    const invoiceIds = ledgerEntries.map((e) => e.invoice_id).filter(Boolean);
    if (invoiceIds.length === 0) return [];

    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      include: { customer: true },
      orderBy: { created_at: 'desc' },
    });
    // The most recent PAYMENT ledger entry per invoice tells us when a
    // now-fully-paid credit sale was actually settled — not tracked as
    // its own column on the invoice, so it's read back from the trail.
    const settlements = await prisma.customerLedgerEntry.findMany({
      where: { invoice_id: { in: invoiceIds }, entry_type: 'PAYMENT' },
      orderBy: { created_at: 'desc' },
    });
    const lastPaymentByInvoice = new Map();
    for (const s of settlements) {
      if (!lastPaymentByInvoice.has(s.invoice_id)) lastPaymentByInvoice.set(s.invoice_id, s.created_at);
    }

    const now = new Date();
    return invoices.map((inv) => ({
      ...this.toDTO(inv, now),
      settledAt: Number(inv.balance_due) === 0 ? lastPaymentByInvoice.get(inv.id) || null : null,
    }));
  }

  async getByCustomer(customerId) {
    const invoices = await prisma.invoice.findMany({
      where: { customer_id: customerId, voided_at: null },
      orderBy: { created_at: 'desc' },
    });
    const ledger = await prisma.customerLedgerEntry.findMany({
      where: { customer_id: customerId },
      orderBy: { created_at: 'desc' },
    });
    const now = new Date();
    return {
      invoices: invoices.map((inv) => this.toDTO(inv, now)),
      ledger: ledger.map((l) => ({
        id: l.id,
        entryType: l.entry_type,
        amount: Number(l.amount),
        balanceAfter: Number(l.balance_after),
        invoiceId: l.invoice_id,
        description: l.description,
        createdAt: l.created_at,
      })),
    };
  }

  /**
   * "In Progress" — every partial payment ever recorded against an
   * invoice that is still outstanding (balance_due > 0) but has already
   * had at least one payment applied (amount_paid > 0). This is a
   * transaction-level view, one row per Payment, distinct from
   * getOutstanding() above which is one row per invoice — a customer who
   * paid 1000 of a 1500 due amount shows up here with that single 1000
   * payment and its date, while still appearing in Outstanding with the
   * invoice's current remaining balance (500).
   *
   * Deliberately excludes anything tied to an InstallmentPlan. An
   * installment sale updates this exact same balance_due/amount_paid on
   * its invoice (see installments.service.js#payInstallment), so without
   * this exclusion every scheduled installment payment would also show
   * up here — but installments are a pre-agreed schedule with their own
   * page, not an ad-hoc partial payment against a credit sale, so they're
   * kept out. Filtered two ways: invoices that have an installment_plan
   * attached are skipped entirely, and — belt and suspenders — any
   * individual Payment row with installment_payment_id set is skipped
   * even if it somehow turned up on a non-plan invoice.
   */
  async getInProgress() {
    const invoices = await prisma.invoice.findMany({
      where: {
        balance_due: { gt: 0 },
        amount_paid: { gt: 0 },
        voided_at: null,
        installment_plan: null,
      },
      include: {
        customer: true,
        payments: { orderBy: { payment_date: 'asc' } },
      },
      orderBy: { due_date: 'asc' },
    });

    const now = new Date();
    const rows = [];
    for (const inv of invoices) {
      const isOverdue = inv.due_date ? new Date(inv.due_date) < now : false;
      for (const p of inv.payments) {
        if (p.installment_payment_id) continue;
        rows.push({
          id: p.id,
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          customerId: inv.customer_id,
          customerName: inv.customer?.name,
          customerType: inv.customer?.customer_type,
          totalDue: Number(inv.total_amount),
          partialPayment: Number(p.amount),
          partialPaymentDate: p.payment_date,
          paymentMethod: p.method,
          // Older rows recorded before balance_after existed and never
          // backfilled fall back to the invoice's current balance —
          // slightly less precise for mid-history rows on that one
          // invoice, but never wrong for the most recent payment.
          remaining: p.balance_after !== null ? Number(p.balance_after) : Number(inv.balance_due),
          actualDueDate: inv.due_date,
          isOverdue,
        });
      }
    }
    // Most recent partial payment first.
    rows.sort((a, b) => new Date(b.partialPaymentDate) - new Date(a.partialPaymentDate));
    return rows;
  }

  /**
   * Records a payment against a specific invoice's remaining balance —
   * "the customer came back and paid some or all of what they owed on
   * this sale." Blocks overpaying past what's actually still due.
   *
   * Returns { invoice, payment } — `payment` is this specific payment
   * shaped as a sub-receipt (see utils/invoiceDto.js), so the caller can
   * immediately show/print/download a receipt for just this transaction,
   * distinct from the original checkout receipt but clearly tied back to
   * it via invoice/receiptNumber.
   */
  async recordPayment(invoiceId, { amount, method, referenceNo, userId }) {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      const err = new Error('Invoice not found');
      err.status = 404;
      throw err;
    }
    const paymentAmount = Number(amount);
    if (Number.isNaN(paymentAmount) || paymentAmount <= 0) {
      const err = new Error('Payment amount must be a positive number.');
      err.status = 400;
      throw err;
    }
    const currentDue = Number(invoice.balance_due);
    if (currentDue <= 0) {
      const err = new Error('This invoice has no outstanding balance.');
      err.status = 400;
      throw err;
    }

    // Real-world payments almost never land on the exact due amount — a
    // customer clearing a 2477 due amount with a 3000 note expects 523
    // back as change, same as an overpayment at checkout (see
    // sales.service.js#checkout / Invoice.change_due). So instead of
    // rejecting anything over the due amount, only the portion up to what's
    // actually owed is applied to the balance; anything beyond that is
    // change handed back, tracked on the payment for the receipt, and
    // never touches the invoice or the customer's ledger balance.
    const appliedAmount = Math.min(paymentAmount, currentDue);
    const changeDue = Math.round((paymentAmount - appliedAmount) * 100) / 100;
    const newBalance = Math.round((currentDue - appliedAmount) * 100) / 100;

    const newPaymentId = await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          balance_due: newBalance,
          amount_paid: { increment: appliedAmount },
          ...(newBalance === 0 && { due_date: null }),
        },
      });
      const payment = await tx.payment.create({
        data: {
          invoice_id: invoiceId,
          customer_id: invoice.customer_id,
          amount: appliedAmount,
          change_due: changeDue,
          method: method || 'CASH',
          reference_no: referenceNo || null,
          balance_after: newBalance,
          created_by: userId,
        },
      });
      await writeLedgerEntry(tx, {
        customerId: invoice.customer_id,
        entryType: 'PAYMENT',
        amount: -appliedAmount,
        invoiceId,
        description:
          changeDue > 0
            ? `Payment received against ${invoice.invoice_number} (${paymentAmount.toFixed(2)} tendered, ${changeDue.toFixed(2)} change given)`
            : `Payment received against ${invoice.invoice_number}`,
        createdBy: userId,
      });
      return payment.id;
    });

    const fullInvoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: INVOICE_INCLUDE_FOR_DTO });
    const invoiceDTO = toInvoiceDTO(fullInvoice);
    const paymentDTO = invoiceDTO.payments.find((p) => p.id === newPaymentId);

    return { invoice: invoiceDTO, payment: paymentDTO };
  }

  /**
   * Charges a late fee as its OWN small invoice, linked back to the
   * original — never edits the original invoice's recorded total, so
   * historical totals never silently change after the fact (see the
   * Invoice.invoice_type comment in schema.prisma for why).
   */
  async chargeLateFee(invoiceId, { amount, note, dueDate, userId }) {
    const original = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!original) {
      const err = new Error('Invoice not found');
      err.status = 404;
      throw err;
    }
    const feeAmount = Number(amount);
    if (Number.isNaN(feeAmount) || feeAmount <= 0) {
      const err = new Error('Late fee amount must be a positive number.');
      err.status = 400;
      throw err;
    }
    if (dueDate && Number.isNaN(new Date(dueDate).getTime())) {
      const err = new Error('Due date is not a valid date.');
      err.status = 400;
      throw err;
    }

    const feeInvoiceNumber = `${original.invoice_number}-LF${Date.now().toString().slice(-4)}`;

    const feeInvoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoice_number: feeInvoiceNumber,
          customer_id: original.customer_id,
          warehouse_id: original.warehouse_id,
          subtotal: feeAmount,
          total_amount: feeAmount,
          amount_paid: 0,
          balance_due: feeAmount,
          due_date: dueDate ? new Date(dueDate) : null,
          invoice_type: 'LATE_FEE',
          related_invoice_id: original.id,
          payment_method: original.payment_method,
          status: 'COMPLETED',
          created_by: userId,
        },
      });
      await writeLedgerEntry(tx, {
        customerId: original.customer_id,
        entryType: 'LATE_FEE',
        amount: feeAmount,
        invoiceId: created.id,
        description: note || `Late fee for overdue invoice ${original.invoice_number}`,
        createdBy: userId,
      });
      return created;
    });

    // Late fee is its own real Invoice row (invoice_type LATE_FEE — see
    // schema.prisma) so it gets a real receipt, not just a list entry.
    // Fetched fresh with the full include set so toInvoiceDTO can shape it
    // exactly like any other invoice receipt (this.toDTO below stays the
    // lighter shape the Outstanding/History/In-Progress tables use).
    const fullFeeInvoice = await prisma.invoice.findUnique({ where: { id: feeInvoice.id }, include: INVOICE_INCLUDE_FOR_DTO });
    return toInvoiceDTO(fullFeeInvoice);
  }

  toDTO(invoice, now) {
    const balanceDue = Number(invoice.balance_due);
    const isOverdue = balanceDue > 0 && invoice.due_date && new Date(invoice.due_date) < now;
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceType: invoice.invoice_type,
      relatedInvoiceId: invoice.related_invoice_id,
      customerId: invoice.customer_id,
      customerName: invoice.customer?.name,
      customerType: invoice.customer?.customer_type,
      totalAmount: Number(invoice.total_amount),
      amountPaid: Number(invoice.amount_paid),
      balanceDue,
      dueDate: invoice.due_date,
      isOverdue,
      createdAt: invoice.created_at,
    };
  }
}

module.exports = new CreditService();