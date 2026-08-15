function computeNewPeriodEnd({ now, currentPeriodEnd, subscriptionStatus, billingCycle }) {
  // A trial is free onboarding time, not prepaid credit. The first approved
  // payment therefore starts a fresh paid period immediately; only a paid
  // ACTIVE subscription preserves its unused days on an early renewal.
  const preservesPaidTime = subscriptionStatus === 'ACTIVE' && new Date(currentPeriodEnd) > now;
  const periodEnd = preservesPaidTime ? new Date(currentPeriodEnd) : new Date(now);
  if (billingCycle === 'MONTHLY') periodEnd.setDate(periodEnd.getDate() + 30);
  if (billingCycle === 'YEARLY') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  return periodEnd;
}

function getDaysRemaining(currentPeriodEnd, now = new Date()) {
  return Math.max(0, Math.ceil((new Date(currentPeriodEnd).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

module.exports = { computeNewPeriodEnd, getDaysRemaining };
