
const prisma = require('../../config/db');

class PayrollService {
  async getAllEmployees() {
    const employees = await prisma.employee.findMany({ orderBy: { name: 'asc' } });
    return employees.map(this.employeeDTO);
  }

  async getRecords(employeeId) {
    const records = await prisma.payrollRecord.findMany({
      where: employeeId ? { employee_id: employeeId } : {},
      include: { employee: true },
      orderBy: { period_start: 'desc' },
    });
    return records.map(this.recordDTO);
  }

  async generate({ employeeId, periodStart, periodEnd, createdBy }) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      const err = new Error('Employee not found');
      err.status = 404;
      throw err;
    }

    const commissions = await prisma.commissionRecord.findMany({
      where: {
        employee_id: employeeId,
        created_at: { gte: new Date(periodStart), lte: new Date(periodEnd) },
      },
    });
    const commissionAmount = commissions.reduce((sum, c) => sum + Number(c.commission_amount), 0);
    const baseSalary = Number(employee.base_salary);
    const totalPayable = baseSalary + commissionAmount;

    const record = await prisma.payrollRecord.create({
      data: {
        employee_id: employeeId,
        period_start: new Date(periodStart),
        period_end: new Date(periodEnd),
        base_salary_amount: baseSalary,
        commission_amount: commissionAmount,
        total_payable: totalPayable,
        created_by: createdBy,
      },
      include: { employee: true },
    });
    return this.recordDTO(record);
  }

  async markPaid(recordId) {
    const record = await prisma.payrollRecord.update({
      where: { id: recordId },
      data: { paid_status: 'PAID', paid_date: new Date() },
      include: { employee: true },
    });
    return this.recordDTO(record);
  }

  employeeDTO(employee) {
    return {
      id: employee.id,
      name: employee.name,
      roleTitle: employee.role_title,
      baseSalary: Number(employee.base_salary),
      commissionRate: employee.commission_rate ? Number(employee.commission_rate) : null,
      isActive: employee.is_active,
    };
  }

  recordDTO(record) {
    return {
      id: record.id,
      employeeId: record.employee_id,
      employeeName: record.employee?.name,
      periodStart: record.period_start,
      periodEnd: record.period_end,
      baseSalaryAmount: Number(record.base_salary_amount),
      commissionAmount: Number(record.commission_amount),
      totalPayable: Number(record.total_payable),
      paidStatus: record.paid_status,
      paidDate: record.paid_date,
    };
  }
}

module.exports = new PayrollService();
