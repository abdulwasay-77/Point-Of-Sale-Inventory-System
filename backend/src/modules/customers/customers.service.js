
const prisma = require('../../config/db');

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
