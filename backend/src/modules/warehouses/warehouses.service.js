
const prisma = require('../../config/db');

class WarehousesService {
  async getAll() {
    const warehouses = await prisma.warehouse.findMany({
      where: { is_active: true },
      orderBy: { created_at: 'asc' },
      include: { stock_levels: true },
    });
    return warehouses.map(this.toDTO);
  }

  async getById(id) {
    const warehouse = await prisma.warehouse.findUnique({ where: { id }, include: { stock_levels: true } });
    if (!warehouse) {
      const err = new Error('Warehouse not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(warehouse);
  }

  async create({ name, address }) {
    const warehouse = await prisma.warehouse.create({ data: { name, address: address || null, is_active: true } });
    return this.toDTO({ ...warehouse, stock_levels: [] });
  }

  async update(id, { name, address }) {
    const warehouse = await prisma.warehouse.update({
      where: { id },
      data: { ...(name !== undefined && { name }), ...(address !== undefined && { address }) },
      include: { stock_levels: true },
    });
    return this.toDTO(warehouse);
  }

  async deactivate(id) {
    const count = await prisma.warehouse.count({ where: { is_active: true } });
    if (count <= 1) {
      const err = new Error('Cannot deactivate the only remaining warehouse');
      err.status = 409;
      throw err;
    }
    const warehouse = await prisma.warehouse.update({ where: { id }, data: { is_active: false }, include: { stock_levels: true } });
    return this.toDTO(warehouse);
  }

  toDTO(warehouse) {
    const totalStock = (warehouse.stock_levels || []).reduce((sum, sl) => sum + Number(sl.quantity), 0);
    return {
      id: warehouse.id,
      name: warehouse.name,
      address: warehouse.address,
      isActive: warehouse.is_active,
      totalStock,
    };
  }
}

module.exports = new WarehousesService();
