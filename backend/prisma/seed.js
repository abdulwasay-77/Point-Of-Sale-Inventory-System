
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

// Starter units of measure — NOT demo data. Every product needs a unit
// to exist at all (Product.base_uom_id is required, see schema.prisma),
// so a brand-new business needs at least one before the Add Product form
// is usable. This is a small, genuinely generic starting point (not
// tied to any retail vertical, unlike the old fixed UomType enum it
// replaces) — freely rename, add to, or delete any of these from
// Settings → Units once logged in.
const STARTER_UNITS = [
  { name: 'Piece', abbreviation: 'pc' },
  { name: 'Box', abbreviation: 'box' },
  { name: 'Kilogram', abbreviation: 'kg' },
  { name: 'Liter', abbreviation: 'L' },
  { name: 'Meter', abbreviation: 'm' },
  { name: 'Dozen', abbreviation: 'dz' },
]

async function main() {
  console.log('🌱 Starting seed...\n')

  // 0. Business — everything below belongs to exactly this one business
  // (see config/db.js — this is what runWithTenant() actually does:
  // every prisma.X.create() call made inside the callback below gets
  // business_id set to this business's id automatically). Created with
  // basePrisma (unscoped) since there's no tenant context yet — this IS
  // how it gets established.
  //
  // No demo catalog data (categories/products/customers/etc.) is
  // created here on purpose — this seed's only job is to get you to a
  // working first login; everything else is added through the app
  // itself from a genuinely blank slate, the same way a real business
  // onboarded by a Super Admin would start.
  console.log('🏢 Creating business...')
  const business = await prisma.basePrisma.business.create({
    data: {
      name: 'CHANGEME',
      slug: 'CHANGEME',
      status: 'CHANGEME',
      industry_type: 'CHANGEME',
      contact_email: 'CHANGEME',
      // Full module access so every screen has something to show — a
      // real business created by a Super Admin would start from
      // DEFAULT_MODULES instead (see business.service.js).
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

  // 2. Starter units of measure — see STARTER_UNITS comment above.
  console.log('\n📏 Creating starter units of measure...')
  for (const u of STARTER_UNITS) {
    await prisma.unitOfMeasure.create({ data: { name: u.name, abbreviation: u.abbreviation } })
  }
  console.log(`   ✅ ${STARTER_UNITS.length} units created (Settings → Units to add/rename/remove)`)

  console.log('\n🎉 Seeding completed!\n')
  console.log(`🏢 Business:  ${business.name}  (slug: ${business.slug})`)
  console.log('📝 Login credentials (primary admin):')
  console.log(`   ${PRIMARY_ADMIN.email} / ${PRIMARY_ADMIN.password}`)
  console.log('\n   No roles, categories, or products were created — build all of it')
  console.log('   from inside the app after logging in with the account above.')

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
