
const prisma = require('../../config/db');

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

class DashboardService {
  async getSummary() {
    const now = new Date();

    const [totalProducts, totalCustomers, todaysInvoices, products] = await Promise.all([
      prisma.product.count({ where: { is_active: true } }),
      prisma.customer.count({ where: { is_active: true, name: { not: 'Walk-in Customer' } } }),
      prisma.invoice.findMany({
        where: { status: 'COMPLETED', created_at: { gte: startOfDay(now), lte: endOfDay(now) } },
      }),
      prisma.product.findMany({ where: { is_active: true }, include: { stock_levels: true } }),
    ]);

    const todaysSales = todaysInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
    const lowStockCount = products.filter((p) => {
      const stock = p.stock_levels.reduce((sum, sl) => sum + Number(sl.quantity), 0);
      return stock <= p.reorder_threshold;
    }).length;

    return { totalProducts, totalCustomers, todaysSales, lowStockCount };
  }
}

module.exports = new DashboardService();
