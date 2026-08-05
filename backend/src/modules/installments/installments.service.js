const prisma = require('../../config/db');
const { writeLedgerEntry } = require('../../utils/customerLedger');
const { toInvoiceDTO, INVOICE_INCLUDE_FOR_DTO } = require('../../utils/invoiceDto');

/**
 * Installments — the plan itself is created as part of checkout (see
 * sales.service.js#checkout, which computes the schedule and required
 * down payment together with the invoice, in one transaction). This
 * module covers everything AFTER that: listing plans, viewing a
 * schedule, and marking individual installments paid as the customer
 * comes back each period.
 */
class InstallmentsService {
  async getAll() {
    const plans = await prisma.installmentPlan.findMany({
      include: { customer: true, invoice: true, installments: true },
      orderBy: { created_at: 'desc' },
    });
    return plans.map((p) => this.toDTO(p));
  }

  async getById(id) {
    const plan = await prisma.installmentPlan.findUnique({
      where: { id },
      include: { customer: true, invoice: true, installments: { orderBy: { sequence: 'asc' } } },
    });
    if (!plan) {
      const err = new Error('Installment plan not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(plan);
  }

  /**
   * Marks one scheduled installment as paid — reduces the same invoice's
   * balance_due (same math as a credit payment), records a Payment row
   * linked to this specific installment, and writes a ledger entry. Once
   * every installment on the plan is paid, the plan itself flips to
   * COMPLETED.
   *
   * Returns { plan, payment } — `payment` is this specific installment
   * payment shaped as a sub-receipt (see utils/invoiceDto.js) so the
   * caller can show/print/download a receipt for just this installment,
   * tied back to the original checkout invoice.
   */
  async payInstallment(planId, installmentId, { method, referenceNo, userId }) {
    const plan = await prisma.installmentPlan.findUnique({
      where: { id: planId },
      include: { installments: true, invoice: true },
    });
    if (!plan) {
      const err = new Error('Installment plan not found');
      err.status = 404;
      throw err;
    }
    const installment = plan.installments.find((i) => i.id === installmentId);
    if (!installment) {
      const err = new Error('Installment not found on this plan');
      err.status = 404;
      throw err;
    }
    if (installment.status === 'PAID') {
      const err = new Error('This installment is already marked paid.');
      err.status = 400;
      throw err;
    }

    const amount = Number(installment.amount);
    const newBalance = Math.max(0, Math.round((Number(plan.invoice.balance_due) - amount) * 100) / 100);
    const allPaid = plan.installments.every((i) => i.id === installmentId || i.status === 'PAID');

    const newPaymentId = await prisma.$transaction(async (tx) => {
      await tx.installmentPayment.update({
        where: { id: installmentId },
        data: { status: 'PAID', paid_date: new Date() },
      });
      const payment = await tx.payment.create({
        data: {
          invoice_id: plan.invoice_id,
          customer_id: plan.customer_id,
          installment_payment_id: installmentId,
          amount,
          method: method || 'CASH',
          reference_no: referenceNo || null,
          balance_after: newBalance,
          created_by: userId,
        },
      });
      await tx.invoice.update({
        where: { id: plan.invoice_id },
        data: { balance_due: newBalance, amount_paid: { increment: amount } },
      });
      if (allPaid) {
        await tx.installmentPlan.update({ where: { id: planId }, data: { status: 'COMPLETED' } });
      }
      await writeLedgerEntry(tx, {
        customerId: plan.customer_id,
        entryType: 'INSTALLMENT_PAYMENT',
        amount: -amount,
        invoiceId: plan.invoice_id,
        description: `Installment #${installment.sequence} of ${plan.installments.length} paid`,
        createdBy: userId,
      });
      return payment.id;
    });

    const [updatedPlan, fullInvoice] = await Promise.all([
      this.getById(planId),
      prisma.invoice.findUnique({ where: { id: plan.invoice_id }, include: INVOICE_INCLUDE_FOR_DTO }),
    ]);
    const invoiceDTO = toInvoiceDTO(fullInvoice);
    const paymentDTO = invoiceDTO.payments.find((p) => p.id === newPaymentId);

    return { plan: updatedPlan, payment: paymentDTO };
  }

  toDTO(plan) {
    const installments = (plan.installments || [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((i) => ({
        id: i.id,
        sequence: i.sequence,
        amount: Number(i.amount),
        dueDate: i.due_date,
        paidDate: i.paid_date,
        status: i.status,
        isOverdue: i.status !== 'PAID' && new Date(i.due_date) < new Date(),
      }));
    const paidCount = installments.filter((i) => i.status === 'PAID').length;
    return {
      id: plan.id,
      invoiceId: plan.invoice_id,
      invoiceNumber: plan.invoice?.invoice_number,
      customerId: plan.customer_id,
      customerName: plan.customer?.name,
      totalAmount: Number(plan.total_amount),
      downPayment: Number(plan.down_payment),
      installmentCount: plan.installment_count,
      installmentAmount: Number(plan.installment_amount),
      frequencyDays: plan.frequency_days,
      status: plan.status,
      paidCount,
      remainingCount: installments.length - paidCount,
      createdAt: plan.created_at,
      installments,
    };
  }
}

module.exports = new InstallmentsService();
