/**
 * Prints exactly one element, at correct 80mm thermal-receipt width,
 * regardless of what else is in the DOM or what other print stylesheets
 * exist elsewhere in the app (e.g. Barcode Labels' A4 print sheet).
 *
 * Why this exists instead of a static `@media print` rule in index.css:
 * two real bugs came from that approach —
 *
 *  1. `@page` is not scoped to a selector the way normal CSS is — it
 *     applies to the whole print job. index.css used to have two
 *     separate `@media print { @page {...} } ` blocks (one for
 *     receipts at 80mm, one for Barcode Labels at A4), and whichever
 *     one happened to appear later in the file silently won for EVERY
 *     print action in the app, including receipts. That's why receipts
 *     were printing as A4 pages.
 *  2. Two different components (InvoiceReceipt and PaymentReceipt)
 *     happened to share the exact same `id="receipt-print-area"`. The
 *     static CSS rule `#receipt-print-area { visibility: visible }`
 *     matches ALL elements with that id, so if both were ever in the
 *     DOM at once (e.g. viewing a payment's sub-receipt in a modal,
 *     with the main invoice receipt still present on the page behind
 *     it), both printed together. That's why it was printing twice.
 *
 * This function sidesteps both: it builds a print stylesheet fresh,
 * every time, scoped to the ONE exact element id passed in, injects it
 * right before printing (so it always wins the cascade — nothing added
 * after this can be added later in the same tick), and removes it
 * immediately after, so the next print action (a different receipt, or
 * an unrelated feature like Barcode Labels) starts from a clean slate
 * instead of accumulating leftover rules.
 */
export function printReceiptElement(elementId) {
  const style = document.createElement('style')
  style.setAttribute('data-dynamic-print', elementId)
  style.textContent = `
    @media print {
      body * {
        visibility: hidden !important;
      }
      #${elementId},
      #${elementId} * {
        visibility: visible !important;
      }
      #${elementId} {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 80mm !important;
        padding: 4mm !important;
        margin: 0 !important;
      }
      @page {
        size: 80mm auto;
        margin: 0;
      }
    }
  `
  document.head.appendChild(style)

  function cleanup() {
    style.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  // Safety net: `afterprint` doesn't fire reliably in every browser
  // (older Safari in particular), so this guarantees the injected style
  // never lingers and affects some later, unrelated print action even
  // if the event is missed.
  window.setTimeout(cleanup, 2000)

  window.print()
}