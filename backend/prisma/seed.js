
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// ============================================================================
// STAFF ACCOUNTS — edit this block with real names/emails/passwords.
// This is the only section you need to touch to personalize the seed.
// Roles must be one of: ADMIN, ACCOUNTANT, SALES_STAFF, WAREHOUSE_STAFF
// ============================================================================
const USERS = [
  { name: 'Abdul Wasay', email: 'wasay@redfort.com', password: 'wasay123', role: 'ADMIN', roleTitle: 'Backend Developer / Admin', baseSalary: 0, commissionRate: null },
  { name: 'Awais Hassan', email: 'awais@redfort.com', password: 'awais123', role: 'ACCOUNTANT', roleTitle: 'Database & Accounts', baseSalary: 45000, commissionRate: null },
  { name: 'Muhammad Talha', email: 'talha@redfort.com', password: 'talha123', role: 'SALES_STAFF', roleTitle: 'Sales Representative', baseSalary: 35000, commissionRate: 4.0 },
  { name: 'Bilal Ahmed', email: 'bilal@redfort.com', password: 'bilal123', role: 'WAREHOUSE_STAFF', roleTitle: 'Warehouse Supervisor', baseSalary: 32000, commissionRate: null },
]
// ============================================================================

const CATEGORIES = [
  { key: 'tiles', name: 'Tiles', description: 'Floor and wall tiles' },
  { key: 'sanitary', name: 'Sanitaryware', description: 'Toilets, basins, urinals' },
  { key: 'fittings', name: 'Bathroom Fittings', description: 'Faucets, showers, mixers, accessories' },
  { key: 'pipes', name: 'Pipes & Fittings', description: 'PVC, CPVC pipes and fittings' },
  { key: 'adhesives', name: 'Adhesives & Grout', description: 'Tile adhesive, grout, sealants' },
  { key: 'hardware', name: 'Hardware & Tools', description: 'General hardware and installation tools' },
]

// stock is intentionally left below reorder_threshold (10) on a handful of
// products, so Inventory / Reports / Dashboard have real low-stock data to
// show right after seeding.
const PRODUCTS = [
  // Tiles — batch-tracked (shade/lot matters for tiles)
  { name: 'Marble White Tile 2x2', sku: 'TILE-MW-2X2', barcode: '8964000000011', categoryKey: 'tiles', brand: 'Premium Tiles', base_uom: 'BOX', coverage_per_box: 15, retail_price: 4500, wholesale_price: 3800, cost_price: 2800, hsn_code: '69072100', gst_rate: 18, reorder_threshold: 10, stock: 120, is_batch_tracked: true },
  { name: 'Ceramic Floor Tile Beige', sku: 'TILE-CF-BEG', barcode: '8964000000028', categoryKey: 'tiles', brand: 'Shabbir Ceramics', base_uom: 'BOX', coverage_per_box: 12, retail_price: 3200, wholesale_price: 2650, cost_price: 2000, hsn_code: '69072200', gst_rate: 18, reorder_threshold: 10, stock: 8, is_batch_tracked: true },
  { name: 'Wooden Finish Vitrified Tile', sku: 'TILE-WF-VIT', barcode: '8964000000035', categoryKey: 'tiles', brand: 'Master Tiles', base_uom: 'BOX', coverage_per_box: 10, retail_price: 5800, wholesale_price: 4900, cost_price: 3600, hsn_code: '69072300', gst_rate: 18, reorder_threshold: 10, stock: 60, is_batch_tracked: true },
  { name: 'Subway Wall Tile White 3x6', sku: 'TILE-SW-3X6', barcode: '8964000000042', categoryKey: 'tiles', brand: 'Premium Tiles', base_uom: 'BOX', coverage_per_box: 20, retail_price: 2100, wholesale_price: 1750, cost_price: 1300, hsn_code: '69072100', gst_rate: 18, reorder_threshold: 15, stock: 200, is_batch_tracked: true },
  { name: 'Granite Look Porcelain Tile', sku: 'TILE-GL-POR', barcode: '8964000000059', categoryKey: 'tiles', brand: 'Master Tiles', base_uom: 'BOX', coverage_per_box: 8, retail_price: 6200, wholesale_price: 5300, cost_price: 4000, hsn_code: '69072300', gst_rate: 18, reorder_threshold: 10, stock: 45, is_batch_tracked: true },
  { name: 'Mosaic Bathroom Tile', sku: 'TILE-MOS-BTH', barcode: '8964000000066', categoryKey: 'tiles', brand: 'Shabbir Ceramics', base_uom: 'BOX', coverage_per_box: 5, retail_price: 3900, wholesale_price: 3300, cost_price: 2500, hsn_code: '69072200', gst_rate: 18, reorder_threshold: 10, stock: 5, is_batch_tracked: true },

  // Sanitaryware
  { name: 'Wash Basin White Oval', sku: 'SAN-WB-OVL', barcode: '8964000000073', categoryKey: 'sanitary', brand: 'Porta', base_uom: 'PIECE', retail_price: 4500, wholesale_price: 3800, cost_price: 2900, hsn_code: '69101000', gst_rate: 18, reorder_threshold: 10, stock: 25, is_batch_tracked: false },
  { name: 'One-Piece Commode', sku: 'SAN-CMD-1PC', barcode: '8964000000080', categoryKey: 'sanitary', brand: 'Porta', base_uom: 'PIECE', retail_price: 18500, wholesale_price: 16000, cost_price: 12500, hsn_code: '69101000', gst_rate: 18, reorder_threshold: 8, stock: 12, is_batch_tracked: false },
  { name: 'Two-Piece Commode', sku: 'SAN-CMD-2PC', barcode: '8964000000097', categoryKey: 'sanitary', brand: 'Master Sanitary', base_uom: 'PIECE', retail_price: 14000, wholesale_price: 12000, cost_price: 9200, hsn_code: '69101000', gst_rate: 18, reorder_threshold: 8, stock: 4, is_batch_tracked: false },
  { name: 'Urinal Wall Mounted', sku: 'SAN-URN-WM', barcode: '8964000000103', categoryKey: 'sanitary', brand: 'Porta', base_uom: 'PIECE', retail_price: 6800, wholesale_price: 5800, cost_price: 4400, hsn_code: '69101000', gst_rate: 18, reorder_threshold: 10, stock: 15, is_batch_tracked: false },
  { name: 'Bidet Shower Set', sku: 'SAN-BID-SET', barcode: '8964000000110', categoryKey: 'sanitary', brand: 'AquaFlow', base_uom: 'PIECE', retail_price: 3200, wholesale_price: 2650, cost_price: 2000, hsn_code: '84818090', gst_rate: 18, reorder_threshold: 10, stock: 30, is_batch_tracked: false },

  // Bathroom fittings
  { name: 'Single Lever Basin Mixer', sku: 'FIT-MIX-BSN', barcode: '8964000000127', categoryKey: 'fittings', brand: 'AquaFlow', base_uom: 'PIECE', retail_price: 5500, wholesale_price: 4700, cost_price: 3600, hsn_code: '84818090', gst_rate: 18, reorder_threshold: 10, stock: 20, is_batch_tracked: false },
  { name: 'Shower Head Rain 8-inch', sku: 'FIT-SHW-8IN', barcode: '8964000000134', categoryKey: 'fittings', brand: 'AquaFlow', base_uom: 'PIECE', retail_price: 4200, wholesale_price: 3500, cost_price: 2700, hsn_code: '84818090', gst_rate: 18, reorder_threshold: 10, stock: 18, is_batch_tracked: false },
  { name: 'Bath Tub Faucet Set', sku: 'FIT-FCT-TUB', barcode: '8964000000141', categoryKey: 'fittings', brand: 'Crown Fittings', base_uom: 'PIECE', retail_price: 8900, wholesale_price: 7600, cost_price: 5900, hsn_code: '84818090', gst_rate: 18, reorder_threshold: 8, stock: 6, is_batch_tracked: false },
  { name: 'Towel Rail Chrome', sku: 'FIT-TWL-CHR', barcode: '8964000000158', categoryKey: 'fittings', brand: 'Crown Fittings', base_uom: 'PIECE', retail_price: 1800, wholesale_price: 1450, cost_price: 1050, hsn_code: '83024900', gst_rate: 18, reorder_threshold: 15, stock: 40, is_batch_tracked: false },

  // Pipes & fittings
  { name: 'PVC Pipe 4-inch 10ft', sku: 'PIP-PVC-4IN', barcode: '8964000000165', categoryKey: 'pipes', brand: 'Crown Pipes', base_uom: 'LENGTH', retail_price: 950, wholesale_price: 800, cost_price: 620, hsn_code: '39172300', gst_rate: 18, reorder_threshold: 20, stock: 300, is_batch_tracked: false },
  { name: 'CPVC Pipe 1-inch 10ft', sku: 'PIP-CPVC-1IN', barcode: '8964000000172', categoryKey: 'pipes', brand: 'Crown Pipes', base_uom: 'LENGTH', retail_price: 650, wholesale_price: 540, cost_price: 410, hsn_code: '39172300', gst_rate: 18, reorder_threshold: 15, stock: 3, is_batch_tracked: false },
  { name: 'PVC Elbow Fitting 4-inch', sku: 'PIP-ELB-4IN', barcode: '8964000000189', categoryKey: 'pipes', brand: 'Crown Pipes', base_uom: 'PIECE', retail_price: 180, wholesale_price: 145, cost_price: 100, hsn_code: '39174000', gst_rate: 18, reorder_threshold: 30, stock: 500, is_batch_tracked: false },

  // Adhesives & grout
  { name: 'Tile Adhesive 20kg Bag', sku: 'ADH-TIL-20KG', barcode: '8964000000196', categoryKey: 'adhesives', brand: 'Diamond Bond', base_uom: 'PIECE', retail_price: 1450, wholesale_price: 1200, cost_price: 900, hsn_code: '35061000', gst_rate: 18, reorder_threshold: 15, stock: 80, is_batch_tracked: false },
  { name: 'Epoxy Grout White 5kg', sku: 'ADH-GRT-5KG', barcode: '8964000000202', categoryKey: 'adhesives', brand: 'Diamond Bond', base_uom: 'PIECE', retail_price: 2200, wholesale_price: 1850, cost_price: 1400, hsn_code: '35061000', gst_rate: 18, reorder_threshold: 10, stock: 25, is_batch_tracked: false },
]

const CUSTOMERS = [
  { name: 'Ahmed Furniture House', contact_phone: '0321-9876543', contact_email: 'ahmed.furniture@gmail.com', address: '45 Mall Road, Lahore', customer_type: 'RETAIL', credit_limit: null, gstin: null },
  { name: 'Al-Karam Construction Co.', contact_phone: '0300-1122334', contact_email: 'info@alkaram-construction.pk', address: 'Plot 22, Industrial Estate, Multan Road, Lahore', customer_type: 'CONTRACTOR', credit_limit: 300000, gstin: '32-1234567-8' },
  { name: 'Malik Sanitary Traders', contact_phone: '0333-4455667', contact_email: 'malik.traders@yahoo.com', address: 'Shop 12, Bank Square Market, Lahore', customer_type: 'WHOLESALE', credit_limit: 500000, gstin: '32-7654321-9' },
  { name: 'Noor Interiors', contact_phone: '0345-2233445', contact_email: 'noor.interiors@gmail.com', address: '9 Gulberg III, Lahore', customer_type: 'RETAIL', credit_limit: null, gstin: null },
  { name: 'City Builders Pvt Ltd', contact_phone: '0311-9988776', contact_email: 'accounts@citybuilders.pk', address: 'Office 4, DHA Phase 5, Lahore', customer_type: 'CONTRACTOR', credit_limit: 750000, gstin: '32-1122334-5' },
  { name: 'Fatima Home Decor', contact_phone: '0301-6677889', contact_email: 'fatima.decor@gmail.com', address: '17 Model Town, Lahore', customer_type: 'RETAIL', credit_limit: null, gstin: null },
  { name: 'Shahzad Tiles & Sanitary', contact_phone: '0322-3344556', contact_email: 'shahzad.tiles@hotmail.com', address: 'Shop 3-A, Ferozepur Road, Lahore', customer_type: 'WHOLESALE', credit_limit: 400000, gstin: '32-9988776-1' },
]

const SUPPLIERS = [
  { name: 'Al-Habib Traders', contact_phone: '0300-1234567', contact_email: 'sales@alhabibtraders.pk', address: 'Plot 12, Industrial Area, Lahore', payment_terms: 'Net 30' },
  { name: 'Master Tiles Distributors', contact_phone: '0331-5566778', contact_email: 'orders@mastertiles.pk', address: 'GT Road, Gujranwala', payment_terms: 'Net 15' },
  { name: 'Shabbir Sanitary Wholesale', contact_phone: '0312-8899001', contact_email: 'info@shabbirsanitary.pk', address: 'Sanitary Market, Badami Bagh, Lahore', payment_terms: 'Net 30' },
  { name: 'Crown Pipes & Fittings', contact_phone: '0345-1122998', contact_email: 'sales@crownpipes.pk', address: 'SITE Area, Karachi', payment_terms: 'Net 45' },
  { name: 'Diamond Adhesives Co.', contact_phone: '0303-7788990', contact_email: 'info@diamondadhesives.pk', address: 'Sundar Industrial Estate, Lahore', payment_terms: 'Net 30' },
]

async function main() {
  console.log('🌱 Starting seed...\n')

  // 1. Users + linked Employee records (skip Employee for pure ADMIN)
  console.log('👤 Creating users...')
  const createdUsers = {}
  for (const u of USERS) {
    const password_hash = await bcrypt.hash(u.password, 10)
    const user = await prisma.user.create({
      data: { name: u.name, email: u.email, password_hash, role: u.role, is_active: true },
    })
    createdUsers[u.email] = user

    if (u.role !== 'ADMIN') {
      await prisma.employee.create({
        data: {
          user_id: user.id,
          name: u.name,
          role_title: u.roleTitle,
          base_salary: u.baseSalary,
          commission_rate: u.commissionRate,
          is_active: true,
          hire_date: new Date(),
        },
      })
    }
    console.log(`   ✅ ${u.role.padEnd(16)} ${u.name} <${u.email}>`)
  }

  // 2. Categories
  console.log('\n📂 Creating categories...')
  const categoryMap = {}
  for (const c of CATEGORIES) {
    categoryMap[c.key] = await prisma.category.create({ data: { name: c.name, description: c.description } })
  }
  console.log(`   ✅ ${CATEGORIES.length} categories created`)

  // 3. Warehouses (FR: multi-location warehouse management — a second
  // location exists from first run so Warehouses & Transfers isn't empty)
  console.log('\n🏬 Creating warehouses...')
  const warehouse = await prisma.warehouse.create({
    data: { name: 'Main Store', address: 'Ferozepur Road, Lahore', is_active: true },
  })
  await prisma.warehouse.create({
    data: { name: 'Warehouse 2 — Multan Road', address: 'Multan Road Industrial Estate, Lahore', is_active: true },
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
          batch_number: `BATCH-${p.sku}-001`,
          shade_code: 'SHADE-A',
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

  // 4b. Kits & bundles (FR: Kitting & Bundling) — sold as one line,
  // components deducted from stock individually at checkout.
  console.log('\n🎁 Creating kits & bundles...')
  await prisma.kit.create({
    data: {
      name: 'Complete Bathroom Set',
      sku: 'KIT-BATHROOM-01',
      kit_price: 24500,
      components: {
        create: [
          { component_product_id: productBySku['SAN-CMD-2PC'].id, quantity: 1 },
          { component_product_id: productBySku['SAN-WB-OVL'].id, quantity: 1 },
          { component_product_id: productBySku['FIT-MIX-BSN'].id, quantity: 1 },
        ],
      },
    },
  })
  await prisma.kit.create({
    data: {
      name: 'Shower Combo',
      sku: 'KIT-SHOWER-01',
      kit_price: 5800,
      components: {
        create: [
          { component_product_id: productBySku['FIT-SHW-8IN'].id, quantity: 1 },
          { component_product_id: productBySku['FIT-TWL-CHR'].id, quantity: 1 },
        ],
      },
    },
  })
  console.log('   ✅ 2 kits created')

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
  console.log('📝 Login credentials:')
  for (const u of USERS) {
    console.log(`   ${u.role.padEnd(16)} ${u.email} / ${u.password}`)
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
