
const prisma = require('../../config/db');

class InventoryService {
  async getAll() {
    const products = await prisma.product.findMany({
      where: { is_active: true },
      include: { category: true, stock_levels: true },
      orderBy: { name: 'asc' },
    });
    return products.map(this.toDTO).sort((a, b) => a.stock - b.stock);
  }

  async getLowStock() {
    const all = await this.getAll();
    return all.filter((p) => p.lowStock);
  }

  toDTO(product) {
    const stock = (product.stock_levels || []).reduce((sum, sl) => sum + Number(sl.quantity), 0);
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category?.name || 'Uncategorized',
      stock,
      reorderThreshold: product.reorder_threshold,
      lowStock: stock <= product.reorder_threshold,
    };
  }
}

module.exports = new InventoryService();
