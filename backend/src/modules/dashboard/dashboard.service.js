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
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [
      totalProducts,
      totalCustomers,
      todaysInvoices,
      products,
      todaysPayments,
      dueTodayInvoices,
      activeInstallmentCount,
    ] = await Promise.all([
      prisma.product.count({ where: { is_active: true } }),
      prisma.customer.count({ where: { is_active: true, name: { not: 'Walk-in Customer' } } }),
      prisma.invoice.findMany({
        where: { status: 'COMPLETED', created_at: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.product.findMany({ where: { is_active: true }, include: { stock_levels: true } }),
      // Payment (not Invoice.payment_method) is the source of truth here —
      // an invoice can receive several payments over time (credit /
      // installments), each with its own method, so this is the only
      // place that correctly attributes "cash collected today" vs
      // "card collected today" regardless of which invoice it came from.
      prisma.payment.findMany({
        where: { payment_date: { gte: todayStart, lte: todayEnd } },
        select: { amount: true, method: true },
      }),
      // "Due today" mirrors the CustomerCredit module's own definition of
      // an outstanding balance (balance_due > 0, not voided) — just
      // narrowed to invoices whose due_date falls today.
      prisma.invoice.findMany({
        where: { balance_due: { gt: 0 }, voided_at: null, due_date: { gte: todayStart, lte: todayEnd } },
        select: { balance_due: true },
      }),
      prisma.installmentPlan.count({ where: { status: 'ACTIVE' } }),
    ]);

    const todaysSales = todaysInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
    const lowStockCount = products.filter((p) => {
      const stock = p.stock_levels.reduce((sum, sl) => sum + Number(sl.quantity), 0);
      return stock <= p.reorder_threshold;
    }).length;

    const cashToday = todaysPayments
      .filter((p) => p.method === 'CASH')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const cardToday = todaysPayments
      .filter((p) => p.method === 'CARD')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const dueTodayAmount = dueTodayInvoices.reduce((sum, inv) => sum + Number(inv.balance_due), 0);
    const dueTodayCount = dueTodayInvoices.length;

    return {
      totalProducts,
      totalCustomers,
      todaysSales,
      lowStockCount,
      cashToday,
      cardToday,
      dueTodayAmount,
      dueTodayCount,
      activeInstallmentCount,
    };
  }

  /**
   * Real invoice totals bucketed for the dashboard chart. Buckets are
   * always fully populated (zero-filled) for the requested window so the
   * chart never has gaps just because a day/month/year had no sales.
   */
  async getSalesChart(period = 'weekly') {
    const now = new Date();

    if (period === 'yearly') {
      const YEARS = 5;
      const startYear = now.getFullYear() - (YEARS - 1);
      const invoices = await prisma.invoice.findMany({
        where: { status: 'COMPLETED', created_at: { gte: new Date(startYear, 0, 1) } },
        select: { total_amount: true, created_at: true },
      });
      const buckets = new Map();
      for (let y = startYear; y <= now.getFullYear(); y += 1) buckets.set(String(y), 0);
      for (const inv of invoices) {
        const key = String(inv.created_at.getFullYear());
        if (buckets.has(key)) buckets.set(key, buckets.get(key) + Number(inv.total_amount));
      }
      return [...buckets.entries()].map(([label, total]) => ({ label, total: Math.round(total * 100) / 100 }));
    }

    if (period === 'monthly') {
      const MONTHS = 12;
      const start = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1);
      const invoices = await prisma.invoice.findMany({
        where: { status: 'COMPLETED', created_at: { gte: start } },
        select: { total_amount: true, created_at: true },
      });
      const buckets = new Map();
      const order = [];
      for (let i = MONTHS - 1; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const label = d.toLocaleDateString('en-US', {
          month: 'short',
          ...(d.getFullYear() !== now.getFullYear() && { year: '2-digit' }),
        });
        order.push({ key, label });
        buckets.set(key, 0);
      }
      for (const inv of invoices) {
        const key = `${inv.created_at.getFullYear()}-${inv.created_at.getMonth()}`;
        if (buckets.has(key)) buckets.set(key, buckets.get(key) + Number(inv.total_amount));
      }
      return order.map(({ key, label }) => ({ label, total: Math.round(buckets.get(key) * 100) / 100 }));
    }

    // weekly (default) — last 7 days, daily buckets.
    const DAYS = 7;
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1)));
    const invoices = await prisma.invoice.findMany({
      where: { status: 'COMPLETED', created_at: { gte: start } },
      select: { total_amount: true, created_at: true },
    });
    const buckets = new Map();
    const order = [];
    for (let i = DAYS - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = d.toDateString();
      order.push({ key, label: d.toLocaleDateString('en-US', { weekday: 'short' }) });
      buckets.set(key, 0);
    }
    for (const inv of invoices) {
      const key = inv.created_at.toDateString();
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + Number(inv.total_amount));
    }
    return order.map(({ key, label }) => ({ label, total: Math.round(buckets.get(key) * 100) / 100 }));
  }

  async getRecentSales(limit = 8) {
    const invoices = await prisma.invoice.findMany({
      where: { voided_at: null },
      include: { customer: true },
      orderBy: { created_at: 'desc' },
      take: Number(limit) || 8,
    });
    return invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      customer: inv.customer?.name || 'Walk-in Customer',
      total: Number(inv.total_amount),
      method: inv.payment_method,
      status: inv.status,
      createdAt: inv.created_at,
    }));
  }
}

module.exports = new DashboardService();