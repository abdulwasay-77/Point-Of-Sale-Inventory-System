
const prisma = require('../../config/db');

class KitsService {
  async getAll() {
    const kits = await prisma.kit.findMany({
      where: { is_active: true },
      include: { components: { include: { component_product: { include: { stock_levels: true } } } } },
      orderBy: { name: 'asc' },
    });
    return kits.map(this.toDTO);
  }

  async getById(id) {
    const kit = await prisma.kit.findUnique({
      where: { id },
      include: { components: { include: { component_product: { include: { stock_levels: true } } } } },
    });
    if (!kit) {
      const err = new Error('Kit not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(kit);
  }

  async create({ name, sku, kitPrice, components }) {
    if (!Array.isArray(components) || components.length < 2) {
      const err = new Error('A kit needs at least 2 component products');
      err.status = 400;
      throw err;
    }
    const kit = await prisma.kit.create({
      data: {
        name,
        sku,
        kit_price: Number(kitPrice),
        components: {
          create: components.map((c) => ({ component_product_id: c.productId, quantity: Number(c.quantity) })),
        },
      },
    });
    return this.getById(kit.id);
  }

  async update(id, { name, kitPrice, components }) {
    await prisma.kit.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(kitPrice !== undefined && { kit_price: Number(kitPrice) }),
      },
    });

    if (Array.isArray(components)) {
      await prisma.kitComponent.deleteMany({ where: { kit_id: id } });
      await prisma.kitComponent.createMany({
        data: components.map((c) => ({ kit_id: id, component_product_id: c.productId, quantity: Number(c.quantity) })),
      });
    }

    return this.getById(id);
  }

  async remove(id) {
    const usageCount = await prisma.invoiceItem.count({ where: { kit_id: id } });
    if (usageCount > 0) {
      await prisma.kit.update({ where: { id }, data: { is_active: false } });
      return;
    }
    await prisma.kitComponent.deleteMany({ where: { kit_id: id } });
    await prisma.kit.delete({ where: { id } });
  }

  toDTO(kit) {
    // A kit's "available to sell" quantity is bounded by whichever
    // component runs out first — the classic bundling constraint.
    const availableQty = kit.components.length
      ? Math.min(
          ...kit.components.map((c) => {
            const stock = c.component_product.stock_levels.reduce((sum, sl) => sum + Number(sl.quantity), 0);
            return Math.floor(stock / Number(c.quantity));
          }),
        )
      : 0;

    return {
      id: kit.id,
      name: kit.name,
      sku: kit.sku,
      price: Number(kit.kit_price),
      isActive: kit.is_active,
      availableQty,
      components: kit.components.map((c) => ({
        productId: c.component_product_id,
        product: c.component_product.name,
        quantity: Number(c.quantity),
      })),
    };
  }
}

module.exports = new KitsService();
