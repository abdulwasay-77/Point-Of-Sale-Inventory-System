const prisma = require('../config/db');

async function suspendExpiredSubscriptions() {
  const expired = await prisma.basePrisma.subscription.findMany({
    where: { status: { in: ['TRIALING', 'ACTIVE'] }, current_period_end: { lt: new Date() } },
    select: { id: true, business_id: true },
  });

  const auditAdmin = await prisma.basePrisma.platformAdmin.findFirst({
    where: { is_active: true },
    orderBy: { created_at: 'asc' },
  });
  if (!auditAdmin) {
    console.warn('Subscription expiry job: no active platform admin found; expired subscriptions will be suspended without audit logs.');
  }

  for (const subscription of expired) {
    // The subscription and business state must always transition together.
    // An audit row is added only when a real active platform admin exists.
    // eslint-disable-next-line no-await-in-loop
    await prisma.basePrisma.$transaction(async (tx) => {
      const current = await tx.subscription.findUnique({ where: { id: subscription.id } });
      if (!current || !['TRIALING', 'ACTIVE'].includes(current.status) || current.current_period_end >= new Date()) return;
      await tx.subscription.update({ where: { id: current.id }, data: { status: 'SUSPENDED' } });
      await tx.business.update({ where: { id: current.business_id }, data: { status: 'SUSPENDED' } });
      if (auditAdmin) {
        await tx.platformAuditLog.create({ data: { platform_admin_id: auditAdmin.id, action: 'AUTO_SUSPENDED_SUBSCRIPTION_EXPIRED', target_business_id: current.business_id, changes: { subscriptionId: current.id, currentPeriodEnd: current.current_period_end.toISOString() } } });
      }
    });
  }
  return expired.length;
}

module.exports = { suspendExpiredSubscriptions };
