# Changes in this delivery

Everything below has been applied to the codebase already — this file is a map of what
changed and, most importantly, **the one manual step you must run before starting the
backend**, since this delivery includes a schema migration that couldn't be applied
against a live database from the build environment.

## ⚠️ Required first step

```bash
cd backend
npx prisma generate
npx prisma migrate deploy   # or: npx prisma migrate dev   (dev/local db)
npm run dev
```

The new migration (`20260719140000_pricing_discount_costing`) adds the discount/margin
fields and the new `cost_lots` table, and backfills an opening cost lot for any stock
that already exists so FIFO sales have something to draw cost from immediately.

**Why this couldn't be run for you:** `prisma generate`/`validate`/`migrate` all need to
download engine binaries from `binaries.prisma.sh`, which the build sandbox's network
policy blocks outright (`x-deny-reason: host_not_allowed`) — this isn't about your
database or credentials, that domain just isn't reachable from where this was built. As
a substitute, `backend/scripts/validate-schema.js` was written to independently check
the schema without needing those binaries — it parses every model/enum and verifies
every relation resolves correctly on both sides. Run it anytime with:
```bash
cd backend
node scripts/validate-schema.js prisma/schema.prisma
```
It currently reports 0 errors, 0 warnings across all 27 models and 9 enums. It's not a
full replacement for `prisma validate` (it can't check SQL-level constraints), but it
catches the class of mistake most likely from a hand-edited schema — a broken relation
or a typo'd type — and it checked every model in the file, not just the new ones.

## GST & discount — now editable, admin-only

- Product form (`Add/Edit Product`) now has a **Pricing, tax & discount** section
  (wholesale price, cost price, GST rate, standing discount, target margin) — visible
  only to users with the new `PRICING_MANAGE` permission (Admin by default). Everyone
  else still sees the plain retail Price field.
- This is enforced **server-side** too (`products.service.js` strips those fields from
  any request that doesn't have the permission), not just hidden in the UI.
- A product's standing discount is applied by default on a POS cart line, and can be
  overridden per sale right there in the cart (click "Add discount" / the discount label
  under a line item) — the product's own default is never changed by that override.

## Costing — FIFO, no averaging

- Every purchase now opens a new **cost lot** at its own price instead of averaging into
  (or silently ignoring) the product's existing cost. Stock is sellable in full,
  immediately, at one selling price — the customer never sees two prices for the same
  product.
- A sale consumes cost lots oldest-first (FIFO) purely to compute the true cost basis for
  margin reporting — this is invisible to the cashier and customer.
- Batch-tracked products (tiles) get cost tracked **per batch**, as accurate as it gets.
- If a product has a **Target Margin %** set, receiving a purchase at a new cost shows a
  "suggested price" banner on the Purchases page — accept or dismiss per product; nothing
  is ever changed automatically.

## Barcode labels — new page, admin-only

- New **Barcode Labels** page (sidebar, admin-only) — select products, choose how many
  copies, preview, and print a sheet of small Code128 labels on standard paper (cut apart
  after printing — no special label printer required).
- A product's barcode is auto-generated from its SKU if one isn't scanned/typed in when
  the product is created, so every product is immediately printable.

## POS page

- Rebuilt cart pricing/UI: per-line discount is now visible and editable right on the
  cart line, with a Subtotal / Discount / GST / Total breakdown that always matches what
  checkout will actually charge.
- Product grid now has category filter chips for faster browsing.

## Chatbot

- Moved from a floating bottom-right button into the top title bar (next to the currency
  switcher), as a dropdown — it's now in the same fixed spot on every page and can never
  overlap page content below it (this is what caused it to cover the POS checkout button
  before).

## Everything from earlier in this session

Login page and chat widget visual polish, the POS scroll fixes (checkout button always
reachable), the `Point of Sale` header no longer being visually covered on hover, and the
backend session/error-message fixes (stale-token handling after a `migrate reset`) are
all already included — this delivery is cumulative, not just today's changes.
