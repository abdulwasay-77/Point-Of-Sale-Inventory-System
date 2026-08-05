const bcrypt = require('bcryptjs')
// The same tenant-scoping client the app uses (see src/config/db.js) —
// using it here too means every prisma.X.create() call below
// automatically gets business_id injected once we're inside
// runWithTenant(), without needing to add it to every single call by
// hand. See main(), which creates the Business first and then wraps
// everything else in exactly that.
const prisma = require('../src/config/db')

// ============================================================================
// PRIMARY ADMIN — edit this with the real name/email/password before
// running against anything but a throwaway local database.
//
// This is the ONLY account this seed creates a login for. There are no
// built-in roles anymore and no other staff accounts are pre-created —
// log in as this account and use Users & Roles in the app itself to
// build whatever role structure and staff list this business actually
// needs, from a completely blank slate.
//
// This account has is_primary_admin=true (see schema.prisma), not a
// role — it has every permission unconditionally, and no one but this
// account itself (or a future Super Admin) can edit, deactivate, or
// override its permissions. It intentionally gets NO linked Employee/
// payroll record — the person running the business isn't necessarily a
// salaried line item in their own Payroll page. Every other user this
// account goes on to create (via the app) can optionally get one — see
// the "paid employee" toggle on Add User.
// ============================================================================
const PRIMARY_ADMIN = {
  name: 'CHANGEME',
  email: 'CHANGEME',
  password: 'CHANGEME',
}
// ============================================================================

const CATEGORIES = [
  { key: 'CHANGEME', name: 'CHANGEME', description: 'CHANGEME' },
  { key: 'CHANGEME', name: 'CHANGEME', description: 'CHANGEME' },
  { key: 'CHANGEME', name: 'CHANGEME', description: 'CHANGEME' },
  { key: 'CHANGEME', name: 'CHANGEME', description: 'CHANGEME' },
  { key: 'CHANGEME', name: 'CHANGEME', description: 'CHANGEME' },
  { key: 'CHANGEME', name: 'CHANGEME', description: 'CHANGEME' },
]

// Demo Variations — reusable, catalog-wide (see the Variations page) —
// and a couple of products that attach to them, so there's real data to
// show the Variation feature working end to end right after seeding.
const VARIATIONS = [
  {
    key: 'CHANGEME',
    name: 'CHANGEME',
    value_type: 'CHANGEME',
    unit: null,
    values: [
      { value: 'CHANGEME', price_adjustment: 0 },
      { value: 'CHANGEME', price_adjustment: 300 },
      { value: 'CHANGEME', price_adjustment: 500 },
      { value: 'CHANGEME', price_adjustment: 250 },
    ],
  },
  {
    key: 'CHANGEME',
    name: 'CHANGEME',
    value_type: 'CHANGEME',
    unit: 'CHANGEME',
    values: [
      { value: 'CHANGEME', price_adjustment: 0 },
      { value: 'CHANGEME', price_adjustment: 80 },
      { value: 'CHANGEME', price_adjustment: 150 },
    ],
  },
]

// Each product here attaches one of the VARIATIONS above and lists the
// specific values it's actually stocked in — mirrors exactly what the Add
// Product form sends when a Variation is picked (see
// products.service.js#allocateVariantsInTx). No top-level `stock` field:
// every unit belongs to a specific value, never a colorless pool.
const VARIANT_PRODUCTS = [
  {
    name: 'CHANGEME',
    sku: 'CHANGEME',
    barcode: 'CHANGEME',
    categoryKey: 'CHANGEME',
    brand: 'CHANGEME',
    base_uom: 'CHANGEME',
    retail_price: 5200,
    wholesale_price: 4400,
    cost_price: 3300,
    hsn_code: 'CHANGEME',
    gst_rate: 18,
    reorder_threshold: 6,
    variationKey: 'CHANGEME',
    variants: [
      { value: 'CHANGEME', sku: 'CHANGEME', stock: 14 },
      { value: 'CHANGEME', sku: 'CHANGEME', stock: 8 },
      { value: 'CHANGEME', sku: 'CHANGEME', stock: 5 },
    ],
  },
  {
    name: 'CHANGEME',
    sku: 'CHANGEME',
    barcode: 'CHANGEME',
    categoryKey: 'CHANGEME',
    brand: 'CHANGEME',
    base_uom: 'CHANGEME',
    retail_price: 700,
    wholesale_price: 580,
    cost_price: 440,
    hsn_code: 'CHANGEME',
    gst_rate: 18,
    reorder_threshold: 20,
    variationKey: 'CHANGEME',
    variants: [
      { value: 'CHANGEME', sku: 'CHANGEME', stock: 120 },
      { value: 'CHANGEME', sku: 'CHANGEME', stock: 90 },
      { value: 'CHANGEME', sku: 'CHANGEME', stock: 40 },
    ],
  },
]

// stock is intentionally left below reorder_threshold (10) on a handful of
// products, so Inventory / Reports / Dashboard have real low-stock data to
// show right after seeding.
const PRODUCTS = [
  // Tiles — batch-tracked (shade/lot matters for tiles)
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', coverage_per_box: 15, retail_price: 4500, wholesale_price: 3800, cost_price: 2800, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 120, is_batch_tracked: true },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', coverage_per_box: 12, retail_price: 3200, wholesale_price: 2650, cost_price: 2000, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 8, is_batch_tracked: true },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', coverage_per_box: 10, retail_price: 5800, wholesale_price: 4900, cost_price: 3600, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 60, is_batch_tracked: true },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', coverage_per_box: 20, retail_price: 2100, wholesale_price: 1750, cost_price: 1300, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 15, stock: 200, is_batch_tracked: true },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', coverage_per_box: 8, retail_price: 6200, wholesale_price: 5300, cost_price: 4000, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 45, is_batch_tracked: true },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', coverage_per_box: 5, retail_price: 3900, wholesale_price: 3300, cost_price: 2500, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 5, is_batch_tracked: true },

  // Sanitaryware
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 4500, wholesale_price: 3800, cost_price: 2900, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 25, is_batch_tracked: false },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 18500, wholesale_price: 16000, cost_price: 12500, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 8, stock: 12, is_batch_tracked: false },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 14000, wholesale_price: 12000, cost_price: 9200, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 8, stock: 4, is_batch_tracked: false },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 6800, wholesale_price: 5800, cost_price: 4400, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 15, is_batch_tracked: false },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 3200, wholesale_price: 2650, cost_price: 2000, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 30, is_batch_tracked: false },

  // Bathroom fittings
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 5500, wholesale_price: 4700, cost_price: 3600, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 20, is_batch_tracked: false },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 4200, wholesale_price: 3500, cost_price: 2700, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 18, is_batch_tracked: false },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 8900, wholesale_price: 7600, cost_price: 5900, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 8, stock: 6, is_batch_tracked: false },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 1800, wholesale_price: 1450, cost_price: 1050, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 15, stock: 40, is_batch_tracked: false },

  // Pipes & fittings
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 950, wholesale_price: 800, cost_price: 620, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 20, stock: 300, is_batch_tracked: false },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 650, wholesale_price: 540, cost_price: 410, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 15, stock: 3, is_batch_tracked: false },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 180, wholesale_price: 145, cost_price: 100, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 30, stock: 500, is_batch_tracked: false },

  // Adhesives & grout
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 1450, wholesale_price: 1200, cost_price: 900, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 15, stock: 80, is_batch_tracked: false },
  { name: 'CHANGEME', sku: 'CHANGEME', barcode: 'CHANGEME', categoryKey: 'CHANGEME', brand: 'CHANGEME', base_uom: 'CHANGEME', retail_price: 2200, wholesale_price: 1850, cost_price: 1400, hsn_code: 'CHANGEME', gst_rate: 18, reorder_threshold: 10, stock: 25, is_batch_tracked: false },
]

const CUSTOMERS = [
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', customer_type: 'CHANGEME', credit_limit: null, gstin: null },
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', customer_type: 'CHANGEME', credit_limit: 300000, gstin: 'CHANGEME' },
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', customer_type: 'CHANGEME', credit_limit: 500000, gstin: 'CHANGEME' },
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', customer_type: 'CHANGEME', credit_limit: null, gstin: null },
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', customer_type: 'CHANGEME', credit_limit: 750000, gstin: 'CHANGEME' },
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', customer_type: 'CHANGEME', credit_limit: null, gstin: null },
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', customer_type: 'CHANGEME', credit_limit: 400000, gstin: 'CHANGEME' },
]

const SUPPLIERS = [
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', payment_terms: 'CHANGEME' },
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', payment_terms: 'CHANGEME' },
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', payment_terms: 'CHANGEME' },
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', payment_terms: 'CHANGEME' },
  { name: 'CHANGEME', contact_phone: 'CHANGEME', contact_email: 'CHANGEME', address: 'CHANGEME', payment_terms: 'CHANGEME' },
]

async function main() {
  console.log('🌱 Starting seed...\n')

  // 0. Business — every table below belongs to exactly this one demo
  // business (see config/db.js — this is what runWithTenant() actually
  // does: every prisma.X.create() call made inside the callback below
  // gets business_id set to this business's id automatically). Created
  // with basePrisma (unscoped) since there's no tenant context yet —
  // this IS how it gets established.
  console.log('🏢 Creating demo business...')
  const business = await prisma.basePrisma.business.create({
    data: {
      name: 'CHANGEME',
      slug: 'CHANGEME',
      status: 'CHANGEME',
      industry_type: 'CHANGEME',
      contact_email: 'CHANGEME',
      // Full module access for the demo business so every screen has
      // something to show — a real business created by a Super Admin
      // would start from DEFAULT_MODULES instead (see business.service.js).
      enabled_modules: [
        'CHANGEME', 'CHANGEME', 'CHANGEME', 'CHANGEME', 'CHANGEME', 'CHANGEME',
        'CHANGEME', 'CHANGEME', 'CHANGEME', 'CHANGEME', 'CHANGEME', 'CHANGEME',
      ],
    },
  })
  console.log(`   ✅ Business: ${business.name} (${business.slug})`)

  await prisma.runWithTenant(business.id, async () => {

  // 1. Primary admin — the one account this seed creates. No role
  // assigned (is_primary_admin bypasses the role/permission system
  // entirely — see schema.prisma), and deliberately no linked Employee
  // record. Everything else (roles, staff, permissions) is built from
  // inside the app after logging in with this account.
  console.log('👤 Creating primary admin...')
  const password_hash = await bcrypt.hash(PRIMARY_ADMIN.password, 10)
  const primaryAdmin = await prisma.user.create({
    data: {
      name: PRIMARY_ADMIN.name,
      email: PRIMARY_ADMIN.email,
      password_hash,
      role: null,
      is_primary_admin: true,
      is_active: true,
    },
  })
  console.log(`   ✅ Primary admin: ${primaryAdmin.name} <${primaryAdmin.email}>`)

  // 2. Categories
  console.log('\n📂 Creating categories...')
  const categoryMap = {}
  for (const c of CATEGORIES) {
    categoryMap[c.key] = await prisma.category.create({ data: { name: c.name, description: c.description } })
  }
  console.log(`   ✅ ${CATEGORIES.length} categories created`)

  // 2b. Variations (reusable, catalog-wide — see the Variations page) and
  // their values, created before any product so products can attach to
  // them the same way a real admin would: define the variation first,
  // then pick it from a dropdown when adding a product.
  console.log('\n🏷️  Creating variations...')
  const variationMap = {} // key -> { variation, valueByText: { 'White': valueRecord, ... } }
  for (const v of VARIATIONS) {
    const variation = await prisma.variation.create({
      data: { name: v.name, value_type: v.value_type, unit: v.unit },
    })
    const valueByText = {}
    for (const val of v.values) {
      valueByText[val.value] = await prisma.variationValue.create({
        data: { variation_id: variation.id, value: val.value, price_adjustment: val.price_adjustment },
      })
    }
    variationMap[v.key] = { variation, valueByText }
  }
  console.log(`   ✅ ${VARIATIONS.length} variations created`)

  // 3. Warehouses (FR: multi-location warehouse management — a second
  // location exists from first run so Warehouses & Transfers isn't empty)
  console.log('\n🏬 Creating warehouses...')
  const warehouse = await prisma.warehouse.create({
    data: { name: 'CHANGEME', address: 'CHANGEME', is_active: true },
  })
  await prisma.warehouse.create({
    data: { name: 'CHANGEME', address: 'CHANGEME', is_active: true },
  })
  console.log('   ✅ 2 warehouses created')

  // 4. Products + stock (+ batch for batch-tracked items)
  console.log('\n📦 Creating products & stock...')
  const productBySku = {}
  for (const p of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category_id: categoryMap[p.categoryKey].id,
        brand: p.brand,
        base_uom: p.base_uom,
        coverage_per_box: p.coverage_per_box || null,
        retail_price: p.retail_price,
        wholesale_price: p.wholesale_price,
        cost_price: p.cost_price,
        hsn_code: p.hsn_code,
        gst_rate: p.gst_rate,
        is_batch_tracked: p.is_batch_tracked,
        reorder_threshold: p.reorder_threshold,
        is_active: true,
      },
    })
    productBySku[p.sku] = product

    let batchId = null
    if (p.is_batch_tracked) {
      const batch = await prisma.batch.create({
        data: {
          product_id: product.id,
          batch_number: `CHANGEME-${p.sku}-001`,
          shade_code: 'CHANGEME',
          received_date: new Date(),
        },
      })
      batchId = batch.id
    }

    await prisma.stockLevel.create({
      data: { product_id: product.id, batch_id: batchId, warehouse_id: warehouse.id, quantity: p.stock },
    })
  }
  console.log(`   ✅ ${PRODUCTS.length} products created with stock`)

  // 4b. Products with a Variation attached — no top-level stock/batch;
  // every unit belongs to one of the picked values below, created inside
  // one transaction each, same as products.service.js#create does for a
  // real Add Product submission.
  console.log('\n🎨 Creating products with variations...')
  for (const p of VARIANT_PRODUCTS) {
    const { valueByText } = variationMap[p.variationKey]
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category_id: categoryMap[p.categoryKey].id,
          brand: p.brand,
          base_uom: p.base_uom,
          retail_price: p.retail_price,
          wholesale_price: p.wholesale_price,
          cost_price: p.cost_price,
          hsn_code: p.hsn_code,
          gst_rate: p.gst_rate,
          is_batch_tracked: false,
          variation_id: variationMap[p.variationKey].variation.id,
          reorder_threshold: p.reorder_threshold,
          is_active: true,
        },
      })
      productBySku[p.sku] = product

      for (const v of p.variants) {
        const value = valueByText[v.value]
        const variant = await tx.productVariant.create({
          data: { product_id: product.id, variation_value_id: value.id, sku: v.sku },
        })
        await tx.stockLevel.create({
          data: { product_id: product.id, variant_id: variant.id, warehouse_id: warehouse.id, quantity: v.stock },
        })
        await tx.costLot.create({
          data: {
            product_id: product.id,
            variant_id: variant.id,
            warehouse_id: warehouse.id,
            unit_cost: p.cost_price,
            quantity_received: v.stock,
            quantity_remaining: v.stock,
          },
        })
      }
    })
  }
  console.log(`   ✅ ${VARIANT_PRODUCTS.length} products with variations created`)

  // 4b. Kits & bundles (FR: Kitting & Bundling) — sold as one line,
  // components deducted from stock individually at checkout.
  //
  // Deliberately NOT a nested `components: { create: [...] } }` write —
  // the tenant-scoping extension (see config/db.js) only injects
  // business_id onto the top-level model of a query, so nested
  // KitComponent rows written this way never get one (that column is
  // NOT NULL) and fail validation. Each kit is created, then its
  // components are created via their own top-level `kitComponent.
  // createMany()` call — same pattern kits.service.js#create now uses.
  console.log('\n🎁 Creating kits & bundles...')
  const KITS = [
    {
      name: 'CHANGEME',
      sku: 'CHANGEME',
      kit_price: 24500,
      componentSkus: [
        { sku: 'CHANGEME', quantity: 1 },
        { sku: 'CHANGEME', quantity: 1 },
        { sku: 'CHANGEME', quantity: 1 },
      ],
    },
    {
      name: 'CHANGEME',
      sku: 'CHANGEME',
      kit_price: 5800,
      componentSkus: [
        { sku: 'CHANGEME', quantity: 1 },
        { sku: 'CHANGEME', quantity: 1 },
      ],
    },
  ]
  for (const k of KITS) {
    const kit = await prisma.kit.create({
      data: { name: k.name, sku: k.sku, kit_price: k.kit_price },
    })
    await prisma.kitComponent.createMany({
      data: k.componentSkus.map((c) => ({
        kit_id: kit.id,
        component_product_id: productBySku[c.sku].id,
        quantity: c.quantity,
      })),
    })
  }
  console.log(`   ✅ ${KITS.length} kits created`)

  // 5. Customers
  console.log('\n🧑‍🤝‍🧑 Creating customers...')
  for (const c of CUSTOMERS) {
    await prisma.customer.create({ data: { ...c, is_active: true } })
  }
  console.log(`   ✅ ${CUSTOMERS.length} customers created`)

  // 6. Suppliers
  console.log('\n🚚 Creating suppliers...')
  for (const s of SUPPLIERS) {
    await prisma.supplier.create({ data: { ...s, is_active: true } })
  }
  console.log(`   ✅ ${SUPPLIERS.length} suppliers created`)

  console.log('\n🎉 Seeding completed!\n')
  console.log(`🏢 Business:  ${business.name}  (slug: ${business.slug})`)
  console.log('📝 Login credentials (primary admin):')
  console.log(`   ${PRIMARY_ADMIN.email} / ${PRIMARY_ADMIN.password}`)
  console.log('\n   No roles or other staff accounts were created — build')
  console.log('   your role structure from Users & Roles after logging in.')

  }) // end runWithTenant
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.basePrisma.$disconnect()
  })