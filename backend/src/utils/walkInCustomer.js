
const prisma = require('../config/db');

// POS sales don't require selecting a customer (walk-in retail sale).
// A single shared "Walk-in Customer" record is used for these, so every
// invoice still has a valid customer_id per the schema.
let cachedId = null;

async function getWalkInCustomerId() {
  if (cachedId) return cachedId;
  let customer = await prisma.customer.findFirst({ where: { name: 'Walk-in Customer' } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { name: 'Walk-in Customer', contact_phone: '-', customer_type: 'RETAIL' },
    });
  }
  cachedId = customer.id;
  return cachedId;
}

module.exports = { getWalkInCustomerId };
