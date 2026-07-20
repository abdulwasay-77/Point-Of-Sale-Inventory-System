
import { jsPDF } from 'jspdf'
import { formatCurrency, formatDateTime } from './formatters'

const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Online Transfer',
  UPI: 'UPI',
  CREDIT: 'Credit',
}

const PAGE_WIDTH_MM = 80
const MARGIN_MM = 4
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2

/**
 * Builds and downloads a narrow (80mm thermal-roll style) PDF receipt for
 * an invoice, mirroring the on-screen InvoiceReceipt layout. Built from
 * the invoice data directly (not a DOM screenshot) so it stays crisp and
 * text-selectable at any zoom level.
 */
export function downloadReceiptPdf(invoice) {
  // Height is unknown up front (depends on item count), so start tall and
  // trim to the actual content height at the end.
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_WIDTH_MM, 400] })
  let y = MARGIN_MM

  const center = (text, size = 10, bold = false) => {
    doc.setFont('courier', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.text(text, PAGE_WIDTH_MM / 2, y, { align: 'center' })
    y += size * 0.5
  }

  const row = (left, right, size = 8, bold = false) => {
    doc.setFont('courier', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.text(left, MARGIN_MM, y)
    doc.text(right, PAGE_WIDTH_MM - MARGIN_MM, y, { align: 'right' })
    y += size * 0.5 + 1
  }

  const dashedLine = () => {
    doc.setLineDashPattern([0.8, 0.8], 0)
    doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y)
    y += 3
  }

  center('Ledger POS', 12, true)
  center('Store Receipt', 8)
  y += 1
  dashedLine()

  row('Invoice #', invoice.invoiceNumber)
  row('Date', formatDateTime(invoice.date))
  row('Customer', invoice.customer)
  row('Cashier', invoice.cashier)

  dashedLine()

  invoice.items.forEach((item) => {
    const label = `${item.product} x${item.quantity}`
    const wrapped = doc.splitTextToSize(label, CONTENT_WIDTH_MM - 18)
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    wrapped.forEach((line, i) => {
      doc.text(line, MARGIN_MM, y)
      if (i === wrapped.length - 1) {
        doc.text(formatCurrency(item.price * item.quantity), PAGE_WIDTH_MM - MARGIN_MM, y, { align: 'right' })
      }
      y += 4
    })
  })

  dashedLine()
  row('Total', formatCurrency(invoice.total), 10, true)

  if (typeof invoice.amountPaid === 'number') {
    y += 1
    row('Payment Method', PAYMENT_METHOD_LABELS[invoice.paymentMethod] || invoice.paymentMethod, 7)
    row('Paid', formatCurrency(invoice.amountPaid), 7)
    row('Change', formatCurrency(invoice.changeDue || 0), 7)
  }

  y += 3
  center('Thank you for shopping with us.', 7)

  doc.save(`${invoice.invoiceNumber || 'receipt'}.pdf`)
}
