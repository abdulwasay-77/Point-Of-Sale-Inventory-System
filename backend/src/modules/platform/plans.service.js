const prisma = require('../../config/db');
const { MODULES } = require('../../config/modules');

class PlansService {
  validate(data) {
    if (!data.name || !data.billingCycle || data.price === undefined) {
      const error = new Error('name, price and billingCycle are required'); error.status = 400; throw error;
    }
    if (!['MONTHLY', 'YEARLY'].includes(data.billingCycle)) {
      const error = new Error('billingCycle must be MONTHLY or YEARLY'); error.status = 400; throw error;
    }
    if (Number(data.price) < 0 || Number(data.trialPeriodDays || 0) < 0) {
      const error = new Error('price and trialPeriodDays cannot be negative'); error.status = 400; throw error;
    }
    const modules = data.defaultEnabledModules || [];
    if (!Array.isArray(modules) || !modules.every((module) => Object.hasOwn(MODULES, module))) {
      const error = new Error('defaultEnabledModules contains an invalid module'); error.status = 400; throw error;
    }
  }

  toDTO(plan) {
    return { id: plan.id, name: plan.name, price: plan.price, billingCycle: plan.billing_cycle, trialPeriodDays: plan.trial_period_days, defaultEnabledModules: plan.default_enabled_modules, defaultMaxAdminSeats: plan.default_max_admin_seats, isActive: plan.is_active, createdAt: plan.created_at, updatedAt: plan.updated_at };
  }

  async list() { return (await prisma.basePrisma.plan.findMany({ orderBy: { created_at: 'desc' } })).map((plan) => this.toDTO(plan)); }
  async create(data) { this.validate(data); return this.toDTO(await prisma.basePrisma.plan.create({ data: { name: data.name.trim(), price: Number(data.price), billing_cycle: data.billingCycle, trial_period_days: Number(data.trialPeriodDays || 0), default_enabled_modules: data.defaultEnabledModules, default_max_admin_seats: data.defaultMaxAdminSeats === null || data.defaultMaxAdminSeats === undefined ? null : Number(data.defaultMaxAdminSeats) } })); }
  async update(id, data) { this.validate(data); return this.toDTO(await prisma.basePrisma.plan.update({ where: { id }, data: { name: data.name.trim(), price: Number(data.price), billing_cycle: data.billingCycle, trial_period_days: Number(data.trialPeriodDays || 0), default_enabled_modules: data.defaultEnabledModules, default_max_admin_seats: data.defaultMaxAdminSeats === null || data.defaultMaxAdminSeats === undefined ? null : Number(data.defaultMaxAdminSeats), ...(data.isActive === undefined ? {} : { is_active: Boolean(data.isActive) }) } })); }
  async deactivate(id) { return this.toDTO(await prisma.basePrisma.plan.update({ where: { id }, data: { is_active: false } })); }
}
module.exports = new PlansService();
