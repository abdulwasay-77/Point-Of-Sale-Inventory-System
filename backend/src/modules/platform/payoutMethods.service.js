const prisma = require('../../config/db');
class PayoutMethodsService {
  toDTO(method) { return { id: method.id, label: method.label, type: method.type, accountTitle: method.account_title, accountNumber: method.account_number, instructions: method.instructions, isActive: method.is_active, createdAt: method.created_at, updatedAt: method.updated_at }; }
  validate(data) { if (!data.label || !data.type || !data.accountTitle || !data.accountNumber) { const error = new Error('label, type, accountTitle and accountNumber are required'); error.status = 400; throw error; } }
  async list() { return (await prisma.basePrisma.payoutMethod.findMany({ orderBy: { created_at: 'desc' } })).map((method) => this.toDTO(method)); }
  async create(data) { this.validate(data); return this.toDTO(await prisma.basePrisma.payoutMethod.create({ data: { label: data.label.trim(), type: data.type.trim(), account_title: data.accountTitle.trim(), account_number: data.accountNumber.trim(), instructions: data.instructions?.trim() || null } })); }
  async update(id, data) { this.validate(data); return this.toDTO(await prisma.basePrisma.payoutMethod.update({ where: { id }, data: { label: data.label.trim(), type: data.type.trim(), account_title: data.accountTitle.trim(), account_number: data.accountNumber.trim(), instructions: data.instructions?.trim() || null, ...(data.isActive === undefined ? {} : { is_active: Boolean(data.isActive) }) } })); }
  async deactivate(id) { return this.toDTO(await prisma.basePrisma.payoutMethod.update({ where: { id }, data: { is_active: false } })); }
}
module.exports = new PayoutMethodsService();
