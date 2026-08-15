const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const prisma = require('../../config/db');
const { getBusinessSettings } = require('../../utils/businessSettings');
const { drawTitlePage, drawTable, pdfSafeCurrencyPrefix } = require('../../utils/pdfTable');

/**
 * Every record type the backup export includes, in the order they'll
 * appear. Deliberately data-driven (one definition per table, not one
 * hand-written export block per table) so adding a new record type to
 * the backup later is a one-entry addition here, not a new function in
 * both the Excel and PDF code paths. `columns` controls both what's
 * fetched (via `select` built from the same list) and the sheet/table
 * header order — one source of truth for both.
 *
 * password_hash is deliberately excluded from the Users export — a
 * backup file is something that gets emailed around and saved to
 * personal drives; it should never be a way to exfiltrate every
 * password hash in the system.
 */
const EXPORTS = [
  { key: 'products', label: 'Products', model: 'product', columns: ['name', 'sku', 'barcode', 'retail_price', 'cost_price', 'is_active'] },
  { key: 'categories', label: 'Categories', model: 'category', columns: ['name', 'description'] },
  { key: 'variations', label: 'Variations', model: 'variation', columns: ['name', 'value_type', 'unit'] },
  { key: 'customers', label: 'Customers', model: 'customer', columns: ['name', 'contact_phone', 'contact_email', 'customer_type', 'credit_limit'] },
  { key: 'suppliers', label: 'Suppliers', model: 'supplier', columns: ['name', 'contact_phone', 'contact_email', 'address'] },
  { key: 'invoices', label: 'Invoices', model: 'invoice', columns: ['invoice_number', 'invoice_type', 'total_amount', 'amount_paid', 'balance_due', 'due_date', 'status', 'created_at'] },
  { key: 'payments', label: 'Payments', model: 'payment', columns: ['amount', 'method', 'reference_no', 'payment_date'] },
  { key: 'purchaseOrders', label: 'Purchase Orders', model: 'purchaseOrder', columns: ['po_number', 'status', 'created_at'] },
  { key: 'stockMovements', label: 'Stock Movements', model: 'stockMovement', columns: ['movement_type', 'quantity', 'reference_note', 'created_at'] },
  { key: 'stockTransfers', label: 'Stock Transfers', model: 'stockTransfer', columns: ['quantity', 'status', 'requested_date'] },
  { key: 'employees', label: 'Employees', model: 'employee', columns: ['name', 'role_title', 'base_salary', 'commission_rate', 'hire_date', 'is_active'] },
  { key: 'payrollRecords', label: 'Payroll Records', model: 'payrollRecord', columns: ['period_start', 'period_end', 'base_salary_amount', 'commission_amount', 'total_payable', 'paid_status'] },
  { key: 'commissionRecords', label: 'Commission Records', model: 'commissionRecord', columns: ['sale_amount', 'commission_rate', 'commission_amount', 'created_at'] },
  { key: 'installmentPlans', label: 'Installment Plans', model: 'installmentPlan', columns: ['total_amount', 'down_payment', 'installment_count', 'installment_amount', 'status', 'created_at'] },
  { key: 'auditLogs', label: 'Audit Logs', model: 'auditLog', columns: ['action', 'entity_type', 'entity_id', 'created_at'] },
];

class SettingsService {
  async getSettings() {
    const settings = await getBusinessSettings();
    return this.toDTO(settings);
  }

  // Branding only — safe to expose without auth (see settings.routes.js).
  //
  // Deliberately does NOT call getBusinessSettings(): that helper requires
  // an active tenant context (a logged-in request — see utils/
  // businessSettings.js), and this route is hit before login. `business`
  // is what tenantMiddleware.js already resolved from the request's
  // subdomain (req.tenantBusiness) and is null whenever the request has
  // no recognizable business subdomain (bare domain, local dev without
  // subdomains configured, etc.) — in that case there's no way to know
  // which business's branding to show, so this falls back to generic
  // app defaults exactly as it always has.
  //
  // Looked up via basePrisma (unscoped): there is no tenant context yet
  // at this point in the request, by design — same reasoning as
  // tenantMiddleware.js's own Business lookup.
  async getPublicSettings(business) {
    if (!business) {
      return { companyName: 'POS & Inventory System', logoUrl: null };
    }

    const settings = await prisma.basePrisma.businessSettings.findUnique({
      where: { business_id: business.id },
      select: { company_name: true, logo_url: true },
    });

    return {
      companyName: settings?.company_name?.trim() || business.name || 'POS & Inventory System',
      logoUrl: settings?.logo_url || null,
    };
  }

  async updateSettings(data, userId) {
    const allowed = [
      'company_name', 'address', 'phone', 'tax_id', 'invoice_footer_note', 'currency_symbol',
      'default_tax_rate', 'invoice_number_prefix', 'min_down_payment_pct', 'low_stock_alerts',
      'overdue_credit_alerts', 'session_timeout_minutes',
    ];
    const updateData = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    const settings = await getBusinessSettings(); // ensures the row exists, gives us its real (per-business) id
    const updated = await prisma.businessSettings.update({
      where: { id: settings.id },
      data: { ...updateData, updated_by: userId },
    });
    return this.toDTO(updated);
  }

  async updateLogo(imageFile, userId) {
    if (!imageFile) {
      const err = new Error('No image uploaded');
      err.status = 400;
      throw err;
    }
    const settings = await getBusinessSettings();
    const updated = await prisma.businessSettings.update({
      where: { id: settings.id },
      data: { logo_url: `/uploads/business/${imageFile.filename}`, updated_by: userId },
    });
    return this.toDTO(updated);
  }

  /** Clears the logo back to null — Sidebar/LoginPage then fall back to
   *  the plain letter badge, same as a business that never uploaded one. */
  async removeLogo(userId) {
    const settings = await getBusinessSettings();
    const updated = await prisma.businessSettings.update({
      where: { id: settings.id },
      data: { logo_url: null, updated_by: userId },
    });
    return this.toDTO(updated);
  }

  /** Pulls every dataset in EXPORTS, in one pass — shared by both the
   *  Excel and PDF export paths below so the two formats can never drift
   *  out of sync in which records they include. */
  async gatherExportData() {
    const results = {};
    for (const def of EXPORTS) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await prisma[def.model].findMany({ orderBy: { created_at: 'desc' } }).catch(() =>
        // A few models (Category, Variation) don't have created_at —
        // fall back to no ordering rather than failing the whole export
        // over one dataset.
        prisma[def.model].findMany(),
      );
      results[def.key] = rows;
    }
    return results;
  }

  async generateExcelBackup() {
    const data = await this.gatherExportData();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'POS Inventory System';
    workbook.created = new Date();

    for (const def of EXPORTS) {
      const sheet = workbook.addWorksheet(def.label.slice(0, 31)); // Excel sheet name limit
      sheet.columns = def.columns.map((c) => ({ header: c, key: c, width: 20 }));
      sheet.getRow(1).font = { bold: true };
      for (const row of data[def.key]) {
        sheet.addRow(this.flattenRow(row, def.columns));
      }
    }
    return workbook.xlsx.writeBuffer();
  }

  /**
   * Full data backup as a properly structured PDF:
   *   1. A cover/title page — brand mark (uploaded logo, or a letter
   *      avatar built from the company name's first letter if none is
   *      set — same fallback rule the Sidebar/LoginPage already use),
   *      the business's own info as set in Settings, and a contents
   *      summary (dataset → record count) so the reader knows what's
   *      inside before flipping past it.
   *   2. One section per dataset, each starting on its own page with a
   *      real bordered/striped table (header row, alternating row
   *      shading, right-aligned numeric columns, automatic pagination
   *      with the header re-drawn on every new page) — replacing the old
   *      "header | value | value" plain-text dump.
   * Shares gatherExportData/flattenRow with the Excel export so the two
   * formats can never disagree on what records are included.
   */
  async generatePdfBackup() {
    const [settings, data] = await Promise.all([getBusinessSettings(), this.gatherExportData()]);
    const doc = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    drawTitlePage(doc, {
      settings,
      documentTitle: 'Full Data Backup',
      subtitle: 'A complete export of every record currently in the system.',
      summaryRows: EXPORTS.map((def) => ({ label: def.label, value: data[def.key].length })),
    });

    const currencySymbol = pdfSafeCurrencyPrefix(settings.currency_symbol);
    const formatCell = (col, val) => {
      if (val === null || val === undefined || val === '') return '';
      if (typeof val === 'boolean') return val ? 'Yes' : 'No';
      if (typeof val === 'number') {
        if (/rate$/i.test(col)) return `${val.toFixed(2)}%`;
        if (/amount|price|total|due|paid|salary|payable|limit/i.test(col)) return `${currencySymbol}${val.toFixed(2)}`;
        return String(val);
      }
      return String(val);
    };

    for (const def of EXPORTS) {
      doc.addPage();
      doc.rect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left * 2, 3).fill('#E8A33D');
      doc.moveDown(0.6);
      doc.fillColor('#1F2430').font('Helvetica-Bold').fontSize(15).text(def.label);
      doc.fillColor('#6B7280').font('Helvetica').fontSize(9).text(`${data[def.key].length} record${data[def.key].length === 1 ? '' : 's'}`);
      doc.moveDown(0.6);

      const rows = data[def.key];
      if (rows.length === 0) {
        doc.fillColor('#6B7280').font('Helvetica').fontSize(9).text('No records.');
        continue;
      }
      const flatRows = rows.map((row) => this.flattenRow(row, def.columns));
      drawTable(doc, { columns: def.columns, rows: flatRows, formatCell });
    }

    // Page numbers — added last, once the final page count is known
    // (bufferPages: true lets us go back and stamp every page). The
    // footer sits inside the bottom margin on purpose, which would
    // normally make PDFKit think the content overflowed and silently
    // insert an extra page for every one we stamp — zeroing the bottom
    // margin for the duration of this call disables that.
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

  /** Prisma returns Decimal/Date objects that don't serialize cleanly
   *  into a spreadsheet/PDF cell — this converts each configured column
   *  to a plain string/number so both export paths render consistently. */
  flattenRow(row, columns) {
    const flat = {};
    for (const col of columns) {
      const val = row[col];
      if (val === null || val === undefined) {
        flat[col] = '';
      } else if (val instanceof Date) {
        flat[col] = val.toISOString().slice(0, 19).replace('T', ' ');
      } else if (typeof val === 'object' && typeof val.toNumber === 'function') {
        flat[col] = val.toNumber(); // Prisma Decimal
      } else {
        flat[col] = val;
      }
    }
    return flat;
  }

  toDTO(settings) {
    return {
      companyName: settings.company_name,
      logoUrl: settings.logo_url,
      address: settings.address,
      phone: settings.phone,
      taxId: settings.tax_id,
      invoiceFooterNote: settings.invoice_footer_note,
      currencySymbol: settings.currency_symbol,
      defaultTaxRate: Number(settings.default_tax_rate),
      invoiceNumberPrefix: settings.invoice_number_prefix,
      minDownPaymentPct: Number(settings.min_down_payment_pct),
      lowStockAlerts: settings.low_stock_alerts,
      overdueCreditAlerts: settings.overdue_credit_alerts,
      sessionTimeoutMinutes: settings.session_timeout_minutes,
      updatedAt: settings.updated_at,
    };
  }
}

module.exports = new SettingsService();