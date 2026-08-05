const fs = require('fs');
const path = require('path');

/**
 * Shared PDFKit building blocks for "structured document" exports —
 * currently used by settings.service.js's PDF backup, written generically
 * enough to reuse for any future PDF export that needs a branded cover
 * page and/or a real bordered table instead of a wall of text.
 *
 * Colors match the app's own "ledger & receipt" theme (see
 * frontend/tailwind.config.js) so an exported PDF looks like it came from
 * the same product, not a generic report generator.
 */
const BRAND = {
  amber: '#E8A33D',
  amberDark: '#C9822A',
  amberLight: '#F6D9A7',
  ink: '#1F2430',
  inkMuted: '#6B7280',
  paperDim: '#F0EDE4',
  teal: '#2F6F6B',
  line: '#E4DFD3',
  white: '#FFFFFF',
};

/**
 * PDFKit's built-in standard fonts (Helvetica etc.) can only encode
 * WinAnsiEncoding (~Windows-1252 / Latin-1 + a handful of extras like €)
 * — NOT most currency symbols such as ₹, ₩, ₦, ฿, ₫. Handing one of those
 * straight to `.text()` doesn't throw; it silently substitutes the wrong
 * glyph (this is exactly the corrupted "¹" superscript character you get
 * from ₹ — reproducible with any Helvetica/PDFKit doc). Embedding a
 * Unicode font is the "real" fix but drags in a multi-hundred-KB font
 * file and multi-script fallback logic for one label; mapping the known
 * symbol to a safe ASCII prefix is what most PDFKit-based tools do
 * instead, and is what this does. Screen/receipt rendering (browser
 * fonts) is unaffected — this only applies to this server-rendered PDF.
 */
const SAFE_CURRENCY_PREFIX = {
  '₹': 'Rs. ',
  '₨': 'Rs. ',
  '৳': 'Tk. ',
  '₩': 'KRW ',
  '₦': 'NGN ',
  '₱': 'PHP ',
  '₫': 'VND ',
  '₴': 'UAH ',
  '₪': 'ILS ',
  '₡': 'CRC ',
  '₲': 'PYG ',
  '₵': 'GHS ',
  '฿': 'THB ',
  '₭': 'LAK ',
  '₮': 'MNT ',
  '₸': 'KZT ',
  '₺': 'TRY ',
  '₼': 'AZN ',
  '₾': 'GEL ',
  '£': '£',
  '€': '€',
  '¥': '¥',
  '$': '$',
};

/** Returns a currency symbol PDFKit's standard fonts can render safely —
 *  either as-is (Latin-1/€, which WinAnsiEncoding does support) or
 *  swapped for a known ASCII-safe prefix. Anything totally unrecognized
 *  falls back to an empty prefix rather than risking another garbled
 *  glyph — a bare number beats a corrupted character. */
function pdfSafeCurrencyPrefix(symbol) {
  if (!symbol) return '';
  const trimmed = symbol.trim();
  if (trimmed in SAFE_CURRENCY_PREFIX) return SAFE_CURRENCY_PREFIX[trimmed];
  const isWinAnsiSafe = [...trimmed].every((ch) => ch.codePointAt(0) <= 0xff);
  return isWinAnsiSafe ? symbol : '';
}

/** Numeric-looking columns (money, quantities) — shared by both the
 *  header row (so the heading right-aligns to sit directly above its
 *  data) and the data rows (so the values right-align consistently),
 *  which is what actually keeps a column's heading and its values
 *  visually locked together instead of drifting apart, rather than one
 *  left-anchored and the other right-anchored inside a wide column. */
function isNumericColumn(col) {
  return /amount|price|total|due|paid|salary|payable|limit|quantity|revenue|balance|spent/i.test(col) && !/note/i.test(col);
}

/**
 * Resolves a stored `/uploads/business/xyz.png`-style path to an absolute
 * file path under backend/uploads, the same convention upload.js writes
 * to. Returns null if the setting is empty or the file no longer exists
 * on disk (e.g. deleted manually) — caller falls back to the letter
 * avatar in that case rather than throwing.
 */
function resolveLogoPath(logoUrl) {
  if (!logoUrl) return null;
  const relative = logoUrl.replace(/^\/uploads\//, '');
  const absolute = path.join(__dirname, '..', '..', 'uploads', relative);
  return fs.existsSync(absolute) ? absolute : null;
}

/**
 * Draws a company "avatar" at (x, y) sized to `size` — the actual logo
 * image if one is on disk, otherwise a filled amber circle with the first
 * letter of the company name centered in it (same fallback rule already
 * used on the Sidebar/LoginPage — see BusinessSettingsContext.jsx).
 */
function drawBrandMark(doc, { companyName, logoPath, x, y, size }) {
  if (logoPath) {
    try {
      doc.save();
      doc.circle(x + size / 2, y + size / 2, size / 2).clip();
      doc.image(logoPath, x, y, { width: size, height: size, fit: [size, size], align: 'center', valign: 'center' });
      doc.restore();
      return;
    } catch {
      // Corrupt/unreadable image file — fall through to the letter avatar.
    }
  }
  const letter = (companyName || 'S').trim().charAt(0).toUpperCase() || 'S';
  doc
    .save()
    .circle(x + size / 2, y + size / 2, size / 2)
    .fill(BRAND.amber)
    .restore();
  doc
    .fillColor(BRAND.white)
    .font('Helvetica-Bold')
    .fontSize(size * 0.42)
    .text(letter, x, y + size * 0.27, { width: size, align: 'center' });
}

/**
 * Renders a full branded cover page: brand mark (logo or letter avatar),
 * company name + contact details, document title, generation timestamp,
 * and an optional summary table (label/value pairs — used for "dataset:
 * record count" at a glance before diving into the detail pages).
 * Always ends on its own page; caller should `doc.addPage()` before
 * drawing the next section.
 */
function drawTitlePage(doc, { settings, documentTitle, subtitle, summaryRows = [] }) {
  const pageWidth = doc.page.width;
  const margin = doc.page.margins.left;
  const contentWidth = pageWidth - margin * 2;

  // Top amber band, purely decorative — echoes the amber top-bar used on
  // cards/modals throughout the app.
  doc.rect(0, 0, pageWidth, 10).fill(BRAND.amber);

  const markSize = 72;
  const markY = 90;
  const logoPath = resolveLogoPath(settings.logo_url);
  drawBrandMark(doc, { companyName: settings.company_name, logoPath, x: pageWidth / 2 - markSize / 2, y: markY, size: markSize });

  let y = markY + markSize + 24;
  doc
    .fillColor(BRAND.ink)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text(settings.company_name || 'Your Business', margin, y, { width: contentWidth, align: 'center' });
  y = doc.y + 4;

  const contactLine = [settings.address, settings.phone, settings.tax_id ? `Tax ID: ${settings.tax_id}` : null].filter(Boolean).join('   ·   ');
  if (contactLine) {
    doc
      .fillColor(BRAND.inkMuted)
      .font('Helvetica')
      .fontSize(9.5)
      .text(contactLine, margin, y, { width: contentWidth, align: 'center' });
    y = doc.y;
  }

  y += 36;
  doc.moveTo(margin + contentWidth / 2 - 60, y).lineTo(margin + contentWidth / 2 + 60, y).lineWidth(1.5).strokeColor(BRAND.amber).stroke();
  y += 28;

  doc
    .fillColor(BRAND.ink)
    .font('Helvetica-Bold')
    .fontSize(17)
    .text(documentTitle, margin, y, { width: contentWidth, align: 'center' });
  y = doc.y + 6;

  if (subtitle) {
    doc
      .fillColor(BRAND.inkMuted)
      .font('Helvetica')
      .fontSize(10)
      .text(subtitle, margin, y, { width: contentWidth, align: 'center' });
    y = doc.y;
  }

  doc
    .fillColor(BRAND.inkMuted)
    .font('Helvetica')
    .fontSize(9)
    .text(`Generated ${new Date().toLocaleString()}`, margin, y + 6, { width: contentWidth, align: 'center' });

  if (summaryRows.length) {
    y = doc.y + 40;
    const boxWidth = Math.min(360, contentWidth);
    const boxX = margin + (contentWidth - boxWidth) / 2;
    const rowHeight = 20;
    const boxHeight = rowHeight * (summaryRows.length + 1) + 16;

    doc.roundedRect(boxX, y, boxWidth, boxHeight, 6).fill(BRAND.paperDim);
    doc
      .fillColor(BRAND.ink)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Contents', boxX + 16, y + 12, { width: boxWidth - 32 });

    let rowY = y + 12 + rowHeight;
    doc.font('Helvetica').fontSize(9.5);
    for (const row of summaryRows) {
      doc.fillColor(BRAND.ink).text(row.label, boxX + 16, rowY, { width: boxWidth - 100 });
      doc.fillColor(BRAND.inkMuted).text(String(row.value), boxX + boxWidth - 84, rowY, { width: 68, align: 'right' });
      rowY += rowHeight;
    }
  }
}

/** Roughly-proportional column widths from header length + a sample of
 *  each column's actual *formatted* cell text (not the raw value) — a
 *  currency-prefixed "Rs. 1250.00" is longer than the raw "1250.00" it
 *  came from, so sizing off the raw value under-allocates the column and
 *  is exactly what made the price columns look cramped. Clamped so no
 *  single column can starve the others and no column drops below a
 *  legible minimum. */
function computeColumnWidths(headers, rows, columns, availableWidth, formatCell) {
  const sampleSize = Math.min(rows.length, 40);
  const weights = columns.map((col, i) => {
    let maxLen = headers[i].length;
    for (let r = 0; r < sampleSize; r += 1) {
      const text = formatCell(col, rows[r][col]);
      if (text) maxLen = Math.max(maxLen, text.length);
    }
    return Math.min(Math.max(maxLen, 6), 34); // clamp 6–34 chars of "weight"
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const minWidth = 55;
  let widths = weights.map((w) => Math.max(minWidth, (w / totalWeight) * availableWidth));
  const scale = availableWidth / widths.reduce((a, b) => a + b, 0);
  widths = widths.map((w) => w * scale);
  return widths;
}

function humanizeHeader(col) {
  return col
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Draws a real bordered/striped data table starting at the current
 * doc.y, paginating automatically (re-drawing the header row on every
 * new page) rather than the old "header | value | value" text-dump.
 * `rows` is an array of flat objects keyed by `columns`.
 *
 * Every cell — header and data — sits inside an actual drawn grid line
 * on all four sides, and a column's heading right-aligns whenever its
 * data does. Relying on alignment alone (heading pinned left, values
 * pinned right, both floating inside one wide unmarked column) is what
 * made values look like they belonged to the *next* column instead of
 * the one they were under; explicit vertical rules remove that ambiguity
 * even before you read a single number.
 *
 * `headers` is optional — omit it to auto-derive from `columns` via
 * humanizeHeader (fine for snake_case DB-style keys like 'retail_price').
 * Pass it explicitly for camelCase keys (e.g. reports.service.js's DTO
 * fields like 'invoiceNumber'), which humanizeHeader can't split into
 * words on its own since there's no underscore to split on.
 */
function drawTable(doc, { columns, rows, formatCell, headers: customHeaders }) {
  const margin = doc.page.margins.left;
  const availableWidth = doc.page.width - margin * 2;
  const headers = customHeaders || columns.map(humanizeHeader);
  const widths = computeColumnWidths(headers, rows, columns, availableWidth, formatCell);
  const colX = [];
  {
    let cursorX = margin;
    for (let i = 0; i < widths.length; i += 1) {
      colX.push(cursorX);
      cursorX += widths[i];
    }
  }
  const cellPadding = 6;
  const fontSize = 8;
  const headerHeight = 24;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  /** Vertical rule at every column boundary (including the two outer
   *  edges) spanning the given y-range — drawn per row/header block since
   *  a table can split across several pages. */
  function drawColumnRules(y, height) {
    doc.strokeColor(BRAND.line).lineWidth(0.5);
    for (let i = 0; i <= columns.length; i += 1) {
      const x = i === columns.length ? margin + availableWidth : colX[i];
      doc.moveTo(x, y).lineTo(x, y + height).stroke();
    }
  }

  function drawHeaderRow() {
    const y = doc.y;
    doc.rect(margin, y, availableWidth, headerHeight).fill(BRAND.amberDark);
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(BRAND.white);
    headers.forEach((h, i) => {
      const align = isNumericColumn(columns[i]) ? 'right' : 'left';
      doc.text(h, colX[i] + cellPadding, y + 8, { width: widths[i] - cellPadding * 2, align, ellipsis: true, lineBreak: false });
    });
    // Thin light rules between header cells — same grid the data rows
    // get, just visible against the amber fill instead of the paper.
    doc.strokeColor(BRAND.amberLight).lineWidth(0.5);
    for (let i = 1; i < columns.length; i += 1) {
      doc.moveTo(colX[i], y).lineTo(colX[i], y + headerHeight).stroke();
    }
    doc.y = y + headerHeight;
  }

  function rowHeightFor(row) {
    doc.font('Helvetica').fontSize(fontSize);
    let maxLines = 1;
    columns.forEach((col, i) => {
      const text = formatCell(col, row[col]);
      const h = doc.heightOfString(text, { width: widths[i] - cellPadding * 2 });
      maxLines = Math.max(maxLines, Math.ceil(h / (fontSize + 2)));
    });
    return Math.max(20, maxLines * (fontSize + 4) + cellPadding * 2);
  }

  drawHeaderRow();

  rows.forEach((row, idx) => {
    const rh = rowHeightFor(row);
    if (doc.y + rh > bottomLimit) {
      doc.addPage();
      drawHeaderRow();
    }
    const y = doc.y;
    if (idx % 2 === 1) {
      doc.rect(margin, y, availableWidth, rh).fill(BRAND.paperDim);
    }
    doc.font('Helvetica').fontSize(fontSize).fillColor(BRAND.ink);
    columns.forEach((col, i) => {
      const text = formatCell(col, row[col]);
      const align = isNumericColumn(col) ? 'right' : 'left';
      doc.text(text, colX[i] + cellPadding, y + cellPadding, { width: widths[i] - cellPadding * 2, align });
    });
    drawColumnRules(y, rh);
    doc
      .moveTo(margin, y + rh)
      .lineTo(margin + availableWidth, y + rh)
      .strokeColor(BRAND.line)
      .lineWidth(0.5)
      .stroke();
    doc.y = y + rh;
  });
}

module.exports = { BRAND, drawTitlePage, drawTable, resolveLogoPath, humanizeHeader, pdfSafeCurrencyPrefix, isNumericColumn };