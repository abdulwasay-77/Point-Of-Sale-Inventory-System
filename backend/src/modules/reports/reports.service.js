
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

class ReportsService {
  async todaySales() {
    const now = new Date();
    const invoices = await prisma.invoice.findMany({
      where: {
        status: 'COMPLETED',
        created_at: { gte: startOfDay(now), lte: endOfDay(now) },
      },
      include: { customer: true },
      orderBy: { created_at: 'desc' },
    });

    return {
      total: invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
      count: invoices.length,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        date: inv.created_at,
        customer: inv.customer?.name || 'Walk-in Customer',
        total: Number(inv.total_amount),
      })),
    };
  }

  async monthlySales(month, year) {
    const now = new Date();
    const targetMonth = month ? Number(month) - 1 : now.getMonth();
    const targetYear = year ? Number(year) : now.getFullYear();

    const start = new Date(targetYear, targetMonth, 1);
    const end = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    const invoices = await prisma.invoice.findMany({
      where: { status: 'COMPLETED', created_at: { gte: start, lte: end } },
    });

    return {
      month: targetMonth + 1,
      year: targetYear,
      total: invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
      count: invoices.length,
    };
  }

  async lowStock() {
    const products = await prisma.product.findMany({
      where: { is_active: true },
      include: { category: true, stock_levels: true },
    });

    return products
      .map((p) => {
        const stock = p.stock_levels.reduce((sum, sl) => sum + Number(sl.quantity), 0);
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category?.name || 'Uncategorized',
          stock,
          reorderThreshold: p.reorder_threshold,
        };
      })
      .filter((p) => p.stock <= p.reorderThreshold)
      .sort((a, b) => a.stock - b.stock);
  }
}

module.exports = new ReportsService();
