
const prisma = require('../../config/db');

class SuppliersService {
  async getAll() {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
    return suppliers.map(this.toDTO);
  }

  async getById(id) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      const err = new Error('Supplier not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(supplier);
  }

  async create(data) {
    const supplier = await prisma.supplier.create({
      data: {
        name: data.name,
        contact_phone: data.phone || data.contact_phone,
        contact_email: data.email || data.contact_email || null,
        address: data.address || null,
        payment_terms: data.payment_terms || null,
      },
    });
    return this.toDTO(supplier);
  }

  async update(id, data) {
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...((data.phone !== undefined || data.contact_phone !== undefined) && {
          contact_phone: data.phone ?? data.contact_phone,
        }),
        ...((data.email !== undefined || data.contact_email !== undefined) && {
          contact_email: data.email ?? data.contact_email,
        }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.payment_terms !== undefined && { payment_terms: data.payment_terms }),
      },
    });
    return this.toDTO(supplier);
  }

  async remove(id) {
    const poCount = await prisma.purchaseOrder.count({ where: { supplier_id: id } });
    if (poCount > 0) {
      const supplier = await prisma.supplier.update({ where: { id }, data: { is_active: false } });
      return this.toDTO(supplier);
    }
    await prisma.supplier.delete({ where: { id } });
    return null;
  }

  /**
   * FR: Supplier Ledgers — running balance, entry history, and a simple
   * 0-30 / 31-60 / 61-90 / 90+ day aging breakdown of what's still owed.
   * Aging buckets by the age of each unpaid PURCHASE entry that hasn't
   * been fully offset by later PAYMENT entries (oldest-debt-first).
   */
  async getLedger(supplierId) {
    const supplier = await this.getById(supplierId);
    const entries = await prisma.supplierLedgerEntry.findMany({
      where: { supplier_id: supplierId },
      orderBy: { created_at: 'asc' },
    });

    const currentBalance = entries.length ? Number(entries[entries.length - 1].balance_after) : 0;

    // Walk purchases oldest-first, offsetting with payments in order, to
    // find how old the *unpaid remainder* of the balance actually is.
    const now = Date.now();
    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    let paymentPool = entries.filter((e) => e.entry_type === 'PAYMENT').reduce((sum, e) => sum + Number(e.amount), 0);

    for (const entry of entries.filter((e) => e.entry_type === 'PURCHASE')) {
      let owed = Number(entry.amount);
      if (paymentPool > 0) {
        const offset = Math.min(paymentPool, owed);
        owed -= offset;
        paymentPool -= offset;
      }
      if (owed <= 0) continue;

      const ageDays = (now - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays <= 30) buckets.current += owed;
      else if (ageDays <= 60) buckets.days30 += owed;
      else if (ageDays <= 90) buckets.days60 += owed;
      else buckets.over90 += owed;
    }

    return {
      supplier,
      currentBalance,
      aging: buckets,
      entries: entries
        .slice()
        .reverse()
        .map((e) => ({
          id: e.id,
          type: e.entry_type,
          amount: Number(e.amount),
          balanceAfter: Number(e.balance_after),
          description: e.description,
          date: e.created_at,
        })),
    };
  }

  /** Records a payment made to a supplier, reducing their outstanding balance. */
  async recordPayment(supplierId, { amount, method, referenceNo, createdBy }) {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      const err = new Error('Payment amount must be greater than zero');
      err.status = 400;
      throw err;
    }

    await prisma.$transaction(async (tx) => {
      const lastEntry = await tx.supplierLedgerEntry.findFirst({
        where: { supplier_id: supplierId },
        orderBy: { created_at: 'desc' },
      });
      const balanceAfter = (lastEntry ? Number(lastEntry.balance_after) : 0) - amt;

      await tx.payment.create({
        data: {
          supplier_id: supplierId,
          amount: amt,
          method: method || 'BANK_TRANSFER',
          reference_no: referenceNo || null,
          created_by: createdBy,
        },
      });

      await tx.supplierLedgerEntry.create({
        data: {
          supplier_id: supplierId,
          entry_type: 'PAYMENT',
          amount: amt,
          balance_after: balanceAfter,
          description: `Payment recorded${referenceNo ? ` (ref ${referenceNo})` : ''}`,
          created_by: createdBy,
        },
      });
    });

    // Read the fresh ledger only after the transaction has committed —
    // reading it from inside the transaction (via the outer, non-tx
    // client) could see stale/uncommitted data.
    return this.getLedger(supplierId);
  }

  toDTO(supplier) {
    return {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.contact_phone,
      email: supplier.contact_email,
      address: supplier.address,
      paymentTerms: supplier.payment_terms,
      isActive: supplier.is_active,
    };
  }
}

module.exports = new SuppliersService();
