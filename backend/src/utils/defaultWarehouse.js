
const prisma = require('../config/db');

// This app's frontend has no concept of multiple warehouses/branches, even
// though the schema supports multi-location inventory. All stock is kept
// against a single default warehouse so the simpler UI still works against
// the richer schema. If a warehouse already exists (e.g. "Main Store" from
// prisma/seed.js) it's reused; otherwise one is created on first use.
let cachedId = null;

async function getDefaultWarehouseId() {
  if (cachedId) return cachedId;

  let warehouse = await prisma.warehouse.findFirst({ where: { is_active: true }, orderBy: { created_at: 'asc' } });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: { name: 'Main Store', address: null, is_active: true },
    });
  }
  cachedId = warehouse.id;
  return cachedId;
}

module.exports = { getDefaultWarehouseId };
