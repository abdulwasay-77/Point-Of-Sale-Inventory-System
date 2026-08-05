const prisma = require('../../config/db');
const { toInvoiceDTO, INVOICE_INCLUDE_FOR_DTO } = require('../../utils/invoiceDto');

class CustomersService {
  async getAll() {
    const customers = await prisma.customer.findMany({ orderBy: { name: 'asc' } });
    return customers.map(this.toDTO);
  }

  async getById(id) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      const err = new Error('Customer not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(customer);
  }

  async create(data) {
    const customer = await prisma.customer.create({
      data: {
        name: data.name,
        contact_phone: data.phone || data.contact_phone,
        contact_email: data.email || data.contact_email || null,
        address: data.address || null,
        customer_type: data.customer_type || 'RETAIL',
        credit_limit: data.credit_limit ?? null,
        gstin: data.gstin || null,
      },
    });
    return this.toDTO(customer);
  }

  async update(id, data) {
    const customer = await prisma.customer.update({
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
        ...(data.customer_type !== undefined && { customer_type: data.customer_type }),
      },
    });
    return this.toDTO(customer);
  }

  async remove(id) {
    const invoiceCount = await prisma.invoice.count({ where: { customer_id: id } });
    if (invoiceCount > 0) {
      // Preserve transaction history — deactivate instead of hard delete.
      const customer = await prisma.customer.update({ where: { id }, data: { is_active: false } });
      return this.toDTO(customer);
    }
    await prisma.customer.delete({ where: { id } });
    return null;
  }

  /**
   * Full purchase history for one customer — every invoice they're
   * attached to (regular sales AND late-fee mini-invoices — see
   * InvoiceType in schema.prisma), newest first.
   *
   * Reuses toInvoiceDTO/INVOICE_INCLUDE_FOR_DTO — the exact same shaping
   * already used by sales.service.js for Sales History / Invoice Detail —
   * so each purchase here already comes with `saleType` (FULL / CREDIT /
   * INSTALLMENT), `balanceDue`, `dueDate`, `installmentPlan`, and the full
   * `items` array. One source of truth for what "a purchase" looks like,
   * rather than a second parallel DTO that could drift from the real one.
   */
  async getPurchases(id) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      const err = new Error('Customer not found');
      err.status = 404;
      throw err;
    }

    const invoices = await prisma.invoice.findMany({
      where: { customer_id: id },
      include: INVOICE_INCLUDE_FOR_DTO,
      orderBy: { created_at: 'desc' },
    });

    return invoices.map(toInvoiceDTO);
  }

  toDTO(customer) {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.contact_phone,
      email: customer.contact_email,
      address: customer.address,
      customerType: customer.customer_type,
      creditLimit: customer.credit_limit ? Number(customer.credit_limit) : null,
      gstin: customer.gstin,
      isActive: customer.is_active,
    };
  }
}

module.exports = new CustomersService();