/**
 * Writes one CustomerLedgerEntry row and computes an accurate
 * `balance_after` by summing every one of the customer's non-voided
 * invoices' current balance_due — not by incrementing a running total,
 * which could drift out of sync if an entry were ever missed. Always
 * self-correcting, at the cost of one extra query per entry.
 *
 * Must be called with a value of `tx` that has ALREADY applied whatever
 * change to invoice(s).balance_due this entry is describing, so the sum
 * reflects the state *after* the change.
 */
async function writeLedgerEntry(tx, { customerId, entryType, amount, invoiceId = null, description = null, createdBy }) {
  const invoices = await tx.invoice.findMany({
    where: { customer_id: customerId, voided_at: null },
    select: { balance_due: true },
  });
  const balanceAfter = invoices.reduce((sum, inv) => sum + Number(inv.balance_due), 0);

  return tx.customerLedgerEntry.create({
    data: {
      customer_id: customerId,
      entry_type: entryType,
      amount,
      balance_after: balanceAfter,
      invoice_id: invoiceId,
      description,
      created_by: createdBy,
    },
  });
}

module.exports = { writeLedgerEntry };
