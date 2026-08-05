const prisma = require('../config/db');

// POS sales don't require selecting a customer (walk-in retail sale). A
// single shared "Walk-in Customer" record per business is used for these,
// so every invoice still has a valid customer_id per the schema.
//
// Same bug and same fix as defaultWarehouse.js (see that file's comment
// for the full explanation) — this used to be one `let cachedId` shared
// across the whole process, which handed one business's walk-in customer
// id to every other business's checkout too. Fixed by keying the cache
// per business_id.
const cachedIdByBusiness = new Map();

async function getWalkInCustomerId() {
  const businessId = prisma.getCurrentBusinessId();
  if (!businessId) {
    throw new Error('getWalkInCustomerId() called outside a tenant request context');
  }

  const cached = cachedIdByBusiness.get(businessId);
  if (cached) return cached;

  let customer = await prisma.customer.findFirst({ where: { name: 'Walk-in Customer' } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { name: 'Walk-in Customer', contact_phone: '-', customer_type: 'RETAIL' },
    });
  }
  cachedIdByBusiness.set(businessId, customer.id);
  return customer.id;
}

module.exports = { getWalkInCustomerId };