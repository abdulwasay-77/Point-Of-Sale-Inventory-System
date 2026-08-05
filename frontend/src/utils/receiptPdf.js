import { jsPDF } from 'jspdf'
import { formatCurrency, formatDate, formatDateTime } from './formatters'

const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Online Transfer',
  UPI: 'UPI',
  CREDIT: 'Credit',
}

const SALE_TYPE_LABELS = {
  FULL: 'Paid in Full',
  CREDIT: 'Customer Credit',
  INSTALLMENT: 'Installment Plan',
}

const PAGE_WIDTH_MM = 80
const MARGIN_MM = 4
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2

function makeDoc() {
  // Height is unknown up front (depends on item count), so start tall and
  // trim to the actual content height at the end.
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_WIDTH_MM, 400] })
  return doc
}

function makeHelpers(doc, state) {
  const center = (text, size = 10, bold = false) => {
    doc.setFont('courier', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.text(text, PAGE_WIDTH_MM / 2, state.y, { align: 'center' })
    state.y += size * 0.5
  }
  const row = (left, right, size = 8, bold = false) => {
    doc.setFont('courier', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.text(String(left), MARGIN_MM, state.y)
    doc.text(String(right), PAGE_WIDTH_MM - MARGIN_MM, state.y, { align: 'right' })
    state.y += size * 0.5 + 1
  }
  const dashedLine = () => {
    doc.setLineDashPattern([0.8, 0.8], 0)
    doc.line(MARGIN_MM, state.y, PAGE_WIDTH_MM - MARGIN_MM, state.y)
    state.y += 3
  }
  return { center, row, dashedLine }
}

/**
 * Builds and downloads a narrow (80mm thermal-roll style) PDF for the
 * ORIGINAL/PARENT receipt of a sale, mirroring the on-screen InvoiceReceipt
 * layout — mirrors its CREDIT/INSTALLMENT sections too, so a printed copy
 * carries the same balance/schedule warnings the on-screen version shows.
 */
export function downloadReceiptPdf(invoice, companyName = 'Ledger POS') {
  const doc = makeDoc()
  const state = { y: MARGIN_MM }
  const { center, row, dashedLine } = makeHelpers(doc, state)
  const saleType = invoice.saleType || (invoice.balanceDue > 0 ? 'CREDIT' : 'FULL')

  center(companyName, 12, true)
  center('Store Receipt', 8)
  if (saleType !== 'FULL') center(SALE_TYPE_LABELS[saleType], 8, true)
  state.y += 1
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
      doc.text(line, MARGIN_MM, state.y)
      if (i === wrapped.length - 1) {
        doc.text(formatCurrency(item.price * item.quantity), PAGE_WIDTH_MM - MARGIN_MM, state.y, { align: 'right' })
      }
      state.y += 4
    })
  })

  dashedLine()
  row('Total', formatCurrency(invoice.total), 10, true)

  if (typeof invoice.amountPaid === 'number') {
    state.y += 1
    row('Payment Method', PAYMENT_METHOD_LABELS[invoice.paymentMethod] || invoice.paymentMethod, 7)
    row(saleType === 'FULL' ? 'Paid' : 'Paid Today', formatCurrency(invoice.amountPaid), 7)
    if (saleType === 'FULL') {
      row('Change', formatCurrency(invoice.changeDue || 0), 7)
    }
  }

  if (saleType === 'CREDIT') {
    dashedLine()
    center('NOT PAID IN FULL', 8, true)
    row('Balance Remaining', formatCurrency(invoice.balanceDue), 8, true)
    if (invoice.dueDate) row('Due On', formatDate(invoice.dueDate), 7)
  }

  if (saleType === 'INSTALLMENT' && invoice.installmentPlan) {
    dashedLine()
    center('Installment Plan', 8, true)
    row('Down Payment', formatCurrency(invoice.installmentPlan.downPayment), 7)
    row('Balance Remaining', formatCurrency(invoice.balanceDue), 7)
    row('Installments', invoice.installmentPlan.installmentCount, 7)
    row('Per Installment', formatCurrency(invoice.installmentPlan.installmentAmount), 7)
    row('Frequency', `Every ${invoice.installmentPlan.frequencyDays} days`, 7)
  }

  state.y += 3
  center('Thank you for shopping with us.', 7)

  doc.save(`${invoice.invoiceNumber || 'receipt'}.pdf`)
}

/**
 * Builds and downloads a PDF for a SUB-RECEIPT — one later payment against
 * an invoice originally opened on Customer Credit or an Installment Plan.
 * Deliberately short: it never restates the item list, only what this one
 * payment settled and the balance before/after, referencing the parent
 * invoice by number.
 */
export function downloadPaymentReceiptPdf(payment, invoice, companyName = 'Ledger POS') {
  const doc = makeDoc()
  const state = { y: MARGIN_MM }
  const { center, row, dashedLine } = makeHelpers(doc, state)
  const balanceBefore = payment.balanceAfter !== null ? payment.balanceAfter + payment.amount : null

  center(companyName, 12, true)
  center('Payment Receipt', 8)
  center(payment.isInstallment ? `Installment #${payment.installmentSequence}` : 'Credit Payment', 8, true)
  state.y += 1
  dashedLine()

  row('Receipt #', payment.receiptNumber)
  row('Against Invoice', invoice.invoiceNumber)
  row('Date', formatDateTime(payment.paymentDate))
  row('Customer', invoice.customer)
  if (payment.referenceNo) row('Reference #', payment.referenceNo)

  dashedLine()
  row('Amount Received', formatCurrency(payment.amount), 10, true)

  state.y += 1
  row('Payment Method', PAYMENT_METHOD_LABELS[payment.method] || payment.method, 7)
  row('Invoice Total', formatCurrency(invoice.total), 7)
  if (balanceBefore !== null) row('Balance Before', formatCurrency(balanceBefore), 7)

  dashedLine()
  row(
    payment.balanceAfter > 0 ? 'Balance Remaining' : 'Balance',
    payment.balanceAfter > 0 ? formatCurrency(payment.balanceAfter) : 'Paid in Full',
    9,
    true,
  )

  state.y += 3
  center(`Confirms payment against invoice ${invoice.invoiceNumber}.`, 6)

  doc.save(`${payment.receiptNumber || 'payment-receipt'}.pdf`)
}
