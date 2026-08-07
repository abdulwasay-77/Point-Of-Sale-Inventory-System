
const prisma = require('../../config/db');

class InventoryService {
  async getAll() {
    const products = await prisma.product.findMany({
      where: { is_active: true },
      include: { category: true, stock_levels: { include: { warehouse: true } } },
      orderBy: { name: 'asc' },
    });
    return products.map(this.toDTO).sort((a, b) => a.stock - b.stock);
  }

  async getLowStock() {
    const all = await this.getAll();
    return all.filter((p) => p.lowStock);
  }

  toDTO(product) {
    const levels = product.stock_levels || [];
    const stock = levels.reduce((sum, sl) => sum + Number(sl.quantity), 0);

    // Per-warehouse breakdown — previously the query already fetched
    // this (stock_levels was already included) but flattened it into one
    // number before it ever reached the frontend, so there was no way to
    // see "20 at Main Store, 30 at Branch 2" anywhere in the app. Grouped
    // by warehouse here (a product can have several StockLevel rows per
    // warehouse — one colorless, one per variant, one per batch — so
    // this sums all of them together per location, which is what
    // "how much of this product is at Location X" actually means).
    const byWarehouse = new Map();
    for (const sl of levels) {
      const key = sl.warehouse_id;
      const existing = byWarehouse.get(key) || { warehouseId: key, warehouseName: sl.warehouse?.name || 'Unknown', quantity: 0 };
      existing.quantity += Number(sl.quantity);
      byWarehouse.set(key, existing);
    }

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category?.name || 'Uncategorized',
      stock,
      reorderThreshold: product.reorder_threshold,
      lowStock: stock <= product.reorder_threshold,
      byWarehouse: [...byWarehouse.values()].sort((a, b) => a.warehouseName.localeCompare(b.warehouseName)),
    };
  }
}

module.exports = new InventoryService();
