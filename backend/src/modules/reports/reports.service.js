const PDFDocument = require('pdfkit');
const prisma = require('../../config/db');
const InventoryService = require('../inventory/inventory.service');
const ExpensesService = require('../expenses/expenses.service');
const { getBusinessSettings } = require('../../utils/businessSettings');
const { toInvoiceDTO, INVOICE_INCLUDE_FOR_DTO } = require('../../utils/invoiceDto');
const { drawTitlePage, drawTable, pdfSafeCurrencyPrefix } = require('../../utils/pdfTable');

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

/**
 * Resolves a named/custom date-range filter into { gte, lte } bounds for
 * created_at. Same preset names and boundary logic as
 * expenses.service.js's resolveDateRange (kept as a separate copy here
 * rather than a shared import, since the two modules' date fields differ
 * and this keeps each module's date-filtering self-contained) — 'daily'
 * | 'weekly' | 'monthly' | 'yearly' | 'custom' (needs startDate/endDate),
 * or no range at all for all-time.
 */
function resolveDateRange({ range, startDate, endDate }) {
  const now = new Date();
  switch (range) {
    case 'daily':
      return { gte: startOfDay(now), lte: endOfDay(now) };
    case 'weekly': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { gte: startOfDay(start), lte: endOfDay(now) };
    }
    case 'monthly':
      return { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: endOfDay(now) };
    case 'yearly':
      return { gte: new Date(now.getFullYear(), 0, 1), lte: endOfDay(now) };
    case 'custom':
      if (!startDate || !endDate) {
        const err = new Error('Both startDate and endDate are required for a custom range.');
        err.status = 400;
        throw err;
      }
      return { gte: startOfDay(startDate), lte: endOfDay(endDate) };
    default:
      return undefined;
  }
}

/** Human-readable description of whichever filter was applied — reused
 *  as both the on-screen subtitle and the PDF's subtitle, so the two
 *  never say something different about what data they're looking at. */
function describeRangeFilter({ range, startDate, endDate }) {
  switch (range) {
    case 'daily':
      return "Today's activity";
    case 'weekly':
      return 'This week';
    case 'monthly':
      return 'This month';
    case 'yearly':
      return 'This year';
    case 'custom':
      return `${new Date(startDate).toLocaleDateString()} – ${new Date(endDate).toLocaleDateString()}`;
    default:
      return 'All time';
  }
}

/** Currency-aware cell formatter shared by every report PDF below.
 *  Column-name matching mirrors settings.service.js's backup formatter,
 *  extended with the field names this module's reports actually use
 *  (revenue, balance, spent, quantitySold, invoiceCount, etc). */
function buildFormatCell(currencySymbol) {
  return (col, val) => {
    if (val === null || val === undefined || val === '') return '';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (val instanceof Date) {
      return val.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    if (typeof val === 'number') {
      if (/quantity|count/i.test(col)) return String(val);
      if (/amount|price|total|due|paid|revenue|balance|spent|purchases/i.test(col)) {
        return `${currencySymbol}${val.toFixed(2)}`;
      }
      return String(val);
    }
    return String(val);
  };
}

class ReportsService {
  // ---- Existing three reports (Today's Sales / Monthly Sales / Low Stock tabs) ----

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

  // ---- Generate Reports: Sales section ----

  /** Same shape as todaySales() above, generalized to any single day
   *  (defaults to today) and with cashier/payment method added — the
   *  Daily Sales report card wants a specific-day drill-down, not just
   *  "today". */
  async dailySales(date) {
    const target = date ? new Date(date) : new Date();
    const invoices = await prisma.invoice.findMany({
      where: {
        status: 'COMPLETED',
        voided_at: null,
        created_at: { gte: startOfDay(target), lte: endOfDay(target) },
      },
      include: { customer: true, created_by_user: true },
      orderBy: { created_at: 'desc' },
    });
    const rows = invoices.map((inv) => ({
      invoiceNumber: inv.invoice_number,
      date: inv.created_at,
      customer: inv.customer?.name || 'Walk-in Customer',
      cashier: inv.created_by_user?.name || 'Unknown',
      paymentMethod: inv.payment_method,
      total: Number(inv.total_amount),
    }));
    return {
      date: target,
      rows,
      total: rows.reduce((sum, r) => sum + r.total, 0),
      count: rows.length,
    };
  }

  /**
   * Shared by salesByProduct/salesByCategory/salesByVariation — every
   * sold InvoiceItem in range, with the relations each breakdown needs.
   * Kit line items (product_id null) are excluded: a kit isn't tied to
   * one product/category/variation, so it has nothing meaningful to
   * attribute to in these three per-product-attribute breakdowns.
   */
  async _getSaleItemsInRange({ range, startDate, endDate }) {
    const dateFilter = resolveDateRange({ range, startDate, endDate });
    return prisma.invoiceItem.findMany({
      where: {
        product_id: { not: null },
        invoice: {
          status: 'COMPLETED',
          voided_at: null,
          invoice_type: 'SALE',
          ...(dateFilter && { created_at: dateFilter }),
        },
      },
      include: {
        product: { include: { category: true, variation: true } },
        variant: { include: { variation_value: true } },
      },
    });
  }

  async salesByProduct(filters) {
    const items = await this._getSaleItemsInRange(filters);
    const byProduct = new Map();
    for (const item of items) {
      const key = item.product_id;
      const existing = byProduct.get(key) || {
        product: item.product?.name || 'Unknown',
        sku: item.product?.sku || '',
        quantitySold: 0,
        revenue: 0,
      };
      existing.quantitySold += Number(item.quantity);
      existing.revenue += Number(item.line_total);
      byProduct.set(key, existing);
    }
    const rows = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);
    return { rows, totalRevenue: rows.reduce((s, r) => s + r.revenue, 0), totalQuantity: rows.reduce((s, r) => s + r.quantitySold, 0) };
  }

  async salesByCategory(filters) {
    const items = await this._getSaleItemsInRange(filters);
    const byCategory = new Map();
    for (const item of items) {
      const key = item.product?.category?.name || 'Uncategorized';
      const existing = byCategory.get(key) || { category: key, quantitySold: 0, revenue: 0 };
      existing.quantitySold += Number(item.quantity);
      existing.revenue += Number(item.line_total);
      byCategory.set(key, existing);
    }
    const rows = [...byCategory.values()].sort((a, b) => b.revenue - a.revenue);
    return { rows, totalRevenue: rows.reduce((s, r) => s + r.revenue, 0), totalQuantity: rows.reduce((s, r) => s + r.quantitySold, 0) };
  }

  /** Only line items sold with a specific variant selected (e.g. "Red")
   *  count here — plain, non-varied products have nothing to break out
   *  by, so they're silently excluded rather than showing up as a
   *  confusing "Unknown" row. */
  async salesByVariation(filters) {
    const items = await this._getSaleItemsInRange(filters);
    const byVariation = new Map();
    for (const item of items) {
      if (!item.variant) continue;
      const variationName = item.product?.variation?.name || 'Variation';
      const value = item.variant.variation_value?.value || 'Unknown';
      const key = `${variationName}::${value}`;
      const existing = byVariation.get(key) || { variation: variationName, value, quantitySold: 0, revenue: 0 };
      existing.quantitySold += Number(item.quantity);
      existing.revenue += Number(item.line_total);
      byVariation.set(key, existing);
    }
    const rows = [...byVariation.values()].sort((a, b) => b.revenue - a.revenue);
    return { rows, totalRevenue: rows.reduce((s, r) => s + r.revenue, 0), totalQuantity: rows.reduce((s, r) => s + r.quantitySold, 0) };
  }

  /** Delegates to ExpensesService.getHistory — the exact same query the
   *  Expenses admin history tab already uses, so this report can never
   *  disagree with what that page shows for the same filter. */
  async expensesReport({ range, startDate, endDate }) {
    const { expenses, summary } = await ExpensesService.getHistory({ range, startDate, endDate });
    return { rows: expenses, count: summary.count, totalSpent: summary.totalSpent };
  }

  /** Delegates to toInvoiceDTO/INVOICE_INCLUDE_FOR_DTO — the same
   *  shaping Sales History and Invoice Detail already use — then flattens
   *  to just the columns this report's table/PDF needs. */
  async invoicesReport({ range, startDate, endDate }) {
    const dateFilter = resolveDateRange({ range, startDate, endDate });
    const invoices = await prisma.invoice.findMany({
      where: { voided_at: null, ...(dateFilter && { created_at: dateFilter }) },
      include: INVOICE_INCLUDE_FOR_DTO,
      orderBy: { created_at: 'desc' },
    });
    const rows = invoices.map(toInvoiceDTO).map((d) => ({
      invoiceNumber: d.invoiceNumber,
      date: d.date,
      customer: d.customer,
      saleType: d.saleType,
      total: d.total,
      balanceDue: d.balanceDue,
      status: d.status,
    }));
    return { rows, count: rows.length, totalAmount: rows.reduce((s, r) => s + r.total, 0) };
  }

  // ---- Generate Reports: Inventory section ----

  /** Delegates to InventoryService.getAll() — the exact same data the
   *  Inventory page itself lists, so this report can't drift from it. */
  async stockReport() {
    const rows = await InventoryService.getAll();
    return { rows, count: rows.length };
  }

  async lowStockReport() {
    const rows = await InventoryService.getLowStock();
    return { rows, count: rows.length };
  }

  // ---- Generate Reports: Customer section ----

  /**
   * One row per customer who has ever completed a purchase — total
   * spend, invoice count, and current outstanding balance. Customers
   * with zero completed invoices are left out entirely; a summary
   * report is about purchasing behavior, and a customer who's never
   * bought anything adds nothing to read here.
   */
  async customerSummary() {
    const [customers, invoices] = await Promise.all([
      prisma.customer.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } }),
      prisma.invoice.findMany({ where: { status: 'COMPLETED', voided_at: null, invoice_type: 'SALE' } }),
    ]);

    const byCustomer = new Map();
    for (const inv of invoices) {
      const existing = byCustomer.get(inv.customer_id) || { invoiceCount: 0, totalPurchases: 0, outstandingBalance: 0 };
      existing.invoiceCount += 1;
      existing.totalPurchases += Number(inv.total_amount);
      existing.outstandingBalance += Number(inv.balance_due);
      byCustomer.set(inv.customer_id, existing);
    }

    const rows = customers
      .map((c) => {
        const agg = byCustomer.get(c.id);
        if (!agg) return null;
        return {
          name: c.name,
          phone: c.contact_phone,
          customerType: c.customer_type,
          invoiceCount: agg.invoiceCount,
          totalPurchases: agg.totalPurchases,
          outstandingBalance: agg.outstandingBalance,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.totalPurchases - a.totalPurchases);

    return {
      rows,
      totalCustomers: rows.length,
      totalOutstanding: rows.reduce((sum, r) => sum + r.outstandingBalance, 0),
    };
  }

  // ---- Generate Reports: shared PDF export ----

  /**
   * One PDF generator for every Generate Reports card, keyed by the
   * same reportKey the frontend route uses. Each branch fetches through
   * the exact same method the on-screen table calls (see
   * ReportDetailPage.jsx / reportService.js), so the PDF and what's on
   * screen can never show different numbers for the same filter.
   * Renders via the shared pdfTable.js building blocks — same branded
   * cover page + bordered table used by the full data backup in
   * settings.service.js, so an exported report looks like it came from
   * the same product.
   */
  async generateReportPdf(reportKey, filters = {}) {
    const builders = {
      'daily-sales': async () => {
        const data = await this.dailySales(filters.date);
        return {
          title: 'Daily Sales Report',
          subtitle: `Sales for ${data.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          rows: data.rows,
          columns: ['invoiceNumber', 'date', 'customer', 'cashier', 'paymentMethod', 'total'],
          headers: ['Invoice #', 'Date', 'Customer', 'Cashier', 'Payment Method', 'Total'],
          summaryRows: [
            { label: 'Invoices', value: data.count },
            { label: 'Total', value: data.total.toFixed(2) },
          ],
        };
      },
      'sales-by-product': async () => {
        const data = await this.salesByProduct(filters);
        return {
          title: 'Sales by Product',
          subtitle: describeRangeFilter(filters),
          rows: data.rows,
          columns: ['product', 'sku', 'quantitySold', 'revenue'],
          headers: ['Product', 'SKU', 'Qty Sold', 'Revenue'],
          summaryRows: [
            { label: 'Products', value: data.rows.length },
            { label: 'Total Revenue', value: data.totalRevenue.toFixed(2) },
          ],
        };
      },
      'sales-by-category': async () => {
        const data = await this.salesByCategory(filters);
        return {
          title: 'Sales by Category',
          subtitle: describeRangeFilter(filters),
          rows: data.rows,
          columns: ['category', 'quantitySold', 'revenue'],
          headers: ['Category', 'Qty Sold', 'Revenue'],
          summaryRows: [
            { label: 'Categories', value: data.rows.length },
            { label: 'Total Revenue', value: data.totalRevenue.toFixed(2) },
          ],
        };
      },
      'sales-by-variation': async () => {
        const data = await this.salesByVariation(filters);
        return {
          title: 'Sales by Variation',
          subtitle: describeRangeFilter(filters),
          rows: data.rows,
          columns: ['variation', 'value', 'quantitySold', 'revenue'],
          headers: ['Variation', 'Value', 'Qty Sold', 'Revenue'],
          summaryRows: [
            { label: 'Variation Values', value: data.rows.length },
            { label: 'Total Revenue', value: data.totalRevenue.toFixed(2) },
          ],
        };
      },
      expenses: async () => {
        const data = await this.expensesReport(filters);
        return {
          title: 'Expenses Report',
          subtitle: describeRangeFilter(filters),
          rows: data.rows,
          columns: ['employeeName', 'category', 'description', 'expenseDate', 'amount', 'status'],
          headers: ['Employee', 'Category', 'Description', 'Date', 'Amount', 'Status'],
          summaryRows: [
            { label: 'Expenses', value: data.count },
            { label: 'Total Spent', value: data.totalSpent.toFixed(2) },
          ],
        };
      },
      invoices: async () => {
        const data = await this.invoicesReport(filters);
        return {
          title: 'Invoices Report',
          subtitle: describeRangeFilter(filters),
          rows: data.rows,
          columns: ['invoiceNumber', 'date', 'customer', 'saleType', 'total', 'balanceDue', 'status'],
          headers: ['Invoice #', 'Date', 'Customer', 'Sale Type', 'Total', 'Balance Due', 'Status'],
          summaryRows: [
            { label: 'Invoices', value: data.count },
            { label: 'Total Amount', value: data.totalAmount.toFixed(2) },
          ],
        };
      },
      'stock-report': async () => {
        const data = await this.stockReport();
        return {
          title: 'Stock Report',
          subtitle: 'Every active product and its current stock level',
          rows: data.rows,
          columns: ['name', 'sku', 'category', 'stock', 'reorderThreshold'],
          headers: ['Product', 'SKU', 'Category', 'Stock', 'Reorder At'],
          summaryRows: [{ label: 'Products', value: data.count }],
        };
      },
      'low-stock-report': async () => {
        const data = await this.lowStockReport();
        return {
          title: 'Low Stock Report',
          subtitle: 'Products at or below their reorder threshold',
          rows: data.rows,
          columns: ['name', 'sku', 'category', 'stock', 'reorderThreshold'],
          headers: ['Product', 'SKU', 'Category', 'Stock', 'Reorder At'],
          summaryRows: [{ label: 'Products Low', value: data.count }],
        };
      },
      'customer-summary': async () => {
        const data = await this.customerSummary();
        return {
          title: 'Customer Summary Report',
          subtitle: 'Total purchases, invoice count, and outstanding balance per customer',
          rows: data.rows,
          columns: ['name', 'phone', 'customerType', 'invoiceCount', 'totalPurchases', 'outstandingBalance'],
          headers: ['Customer', 'Phone', 'Type', 'Invoices', 'Total Purchases', 'Outstanding'],
          summaryRows: [
            { label: 'Customers', value: data.totalCustomers },
            { label: 'Outstanding', value: data.totalOutstanding.toFixed(2) },
          ],
        };
      },
    };

    const build = builders[reportKey];
    if (!build) {
      const err = new Error(`Unknown report: ${reportKey}`);
      err.status = 400;
      throw err;
    }

    const [settings, { title, subtitle, rows, columns, headers, summaryRows }] = await Promise.all([
      getBusinessSettings(),
      build(),
    ]);

    const doc = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    drawTitlePage(doc, { settings, documentTitle: title, subtitle, summaryRows });

    const currencySymbol = pdfSafeCurrencyPrefix(settings.currency_symbol);
    const formatCell = buildFormatCell(currencySymbol);

    doc.addPage();
    doc.rect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left * 2, 3).fill('#E8A33D');
    doc.moveDown(0.6);
    doc.fillColor('#1F2430').font('Helvetica-Bold').fontSize(15).text(title);
    doc.fillColor('#6B7280').font('Helvetica').fontSize(9).text(`${rows.length} record${rows.length === 1 ? '' : 's'} — ${subtitle}`);
    doc.moveDown(0.6);

    if (rows.length === 0) {
      doc.fillColor('#6B7280').font('Helvetica').fontSize(9).text('No records for this filter.');
    } else {
      drawTable(doc, { columns, headers, rows, formatCell });
    }

    // Page numbers — see settings.service.js#generatePdfBackup for why
    // the bottom margin is temporarily zeroed while stamping these.
    const pageCount = doc.bufferedPageRange().count;
    const savedBottomMargin = doc.page.margins.bottom;
    for (let i = 0; i < pageCount; i += 1) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc
        .fillColor('#6B7280')
        .font('Helvetica')
        .fontSize(8)
        .text(`Page ${i + 1} of ${pageCount}`, doc.page.margins.left, doc.page.height - savedBottomMargin + 12, {
          width: doc.page.width - doc.page.margins.left * 2,
          align: 'center',
          lineBreak: false,
        });
      doc.page.margins.bottom = savedBottomMargin;
    }

    doc.end();
    return done;
  }
}

module.exports = new ReportsService();