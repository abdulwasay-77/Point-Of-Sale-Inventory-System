const prisma = require('../config/db');

// This app's frontend has no concept of multiple warehouses/branches, even
// though the schema supports multi-location inventory. All stock is kept
// against a single default warehouse per business so the simpler UI still
// works against the richer schema. If a warehouse already exists for this
// business it's reused; otherwise one is created on first use.
//
// BUG FIX: this used to be a single `let cachedId` shared across the whole
// Node process. That's correct for a single-tenant app, but once multiple
// businesses can be logged in against the same running server, whichever
// business happened to call this FIRST would have its warehouse id cached
// and handed out to every OTHER business too — so Business B's checkout
// could silently look up stock against Business A's warehouse id, find
// nothing there, and fail with "insufficient stock" for a product that
// genuinely had stock (just recorded against the correct warehouse, which
// wasn't the one being checked due to the stale cross-tenant cache). Only
// went away on a server restart because that's what reset the cache.
//
// Fixed by keying the cache per business_id instead of one shared value —
// each business gets its own cached id, looked up once and reused after
// that, with zero risk of one business's id leaking into another's request.
const cachedIdByBusiness = new Map();

async function getDefaultWarehouseId() {
  const businessId = prisma.getCurrentBusinessId();
  if (!businessId) {
    throw new Error('getDefaultWarehouseId() called outside a tenant request context');
  }

  const cached = cachedIdByBusiness.get(businessId);
  if (cached) return cached;

  let warehouse = await prisma.warehouse.findFirst({ where: { is_active: true }, orderBy: { created_at: 'asc' } });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: { name: 'Main Store', address: null, is_active: true },
    });
  }
  cachedIdByBusiness.set(businessId, warehouse.id);
  return warehouse.id;
}

module.exports = { getDefaultWarehouseId };