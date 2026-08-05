
const prisma = require('../../config/db');
const UsersService = require('../users/users.service');

class PayrollService {
  async getAllEmployees() {
    const employees = await prisma.employee.findMany({ orderBy: { name: 'asc' } });
    return employees.map(this.employeeDTO);
  }

  /**
   * Creates the HR record for a staff member. Three mutually exclusive
   * ways to call this, matched by which optional field is present:
   *
   *  1. `data.newLogin` — the default/expected path from the Add
   *     Employee form. Creates a brand-new User AND this Employee
   *     record together, via UsersService.createUser (the same
   *     method User Management's "Add User" uses), so a person added
   *     from either screen ends up in exactly the same state. This
   *     requires USERS_MANAGE (see payroll.routes.js) — only Admin has
   *     that by default, since creating a login is an Admin privilege
   *     regardless of which screen you start from.
   *
   *  2. `data.userId` — links to an EXISTING login account instead of
   *     creating a new one. Mainly useful for legacy accounts created
   *     before Users started auto-creating an Employee record (see the
   *     backfill script) that somehow still don't have one.
   *
   *  3. Neither — a "payroll-only" employee with no login at all. Kept
   *     deliberately available (not removed) for staff who should never
   *     get system access — warehouse labor, cleaners, etc. See
   *     Employee.user_id in schema.prisma for why this is nullable.
   */
  async createEmployee(data) {
    if (!data.name || !data.name.trim()) {
      const err = new Error('Employee name is required.');
      err.status = 400;
      throw err;
    }
    if (data.baseSalary === undefined || Number(data.baseSalary) < 0) {
      const err = new Error('A valid base salary is required.');
      err.status = 400;
      throw err;
    }
    if (data.userId && data.newLogin) {
      const err = new Error('Choose either an existing login or a new one, not both.');
      err.status = 400;
      throw err;
    }

    if (data.newLogin) {
      const { email, password, role } = data.newLogin;
      if (!email || !password || !role) {
        const err = new Error('A new login requires an email, password and role.');
        err.status = 400;
        throw err;
      }
      const { employeeRecord } = await UsersService.createUser({
        name: data.name.trim(),
        email,
        password,
        role,
        employee: {
          roleTitle: data.roleTitle,
          baseSalary: data.baseSalary,
          commissionRate: data.commissionRate,
          contactPhone: data.contactPhone,
          address: data.address,
          hireDate: data.hireDate,
        },
      });
      return this.employeeDTO(employeeRecord);
    }

    if (data.userId) {
      const existing = await prisma.employee.findUnique({ where: { user_id: data.userId } });
      if (existing) {
        const err = new Error('That user account is already linked to another employee record.');
        err.status = 409;
        throw err;
      }
    }
    const employee = await prisma.employee.create({
      data: {
        user_id: data.userId || null,
        name: data.name.trim(),
        role_title: data.roleTitle || '',
        contact_phone: data.contactPhone || null,
        address: data.address || null,
        base_salary: Number(data.baseSalary),
        commission_rate: data.commissionRate !== undefined && data.commissionRate !== '' ? Number(data.commissionRate) : null,
        hire_date: data.hireDate ? new Date(data.hireDate) : new Date(),
      },
    });
    return this.employeeDTO(employee);
  }

  /** Admin-managed fields only — the employee's own edits to name/
   *  contact/address go through profile.service.js instead, which also
   *  keeps this record's `name` in sync with the linked User. */
  async updateEmployee(id, data) {
    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...(data.roleTitle !== undefined && { role_title: data.roleTitle }),
        ...(data.baseSalary !== undefined && { base_salary: Number(data.baseSalary) }),
        ...(data.commissionRate !== undefined && {
          commission_rate: data.commissionRate === '' || data.commissionRate === null ? null : Number(data.commissionRate),
        }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
      },
    });
    return this.employeeDTO(employee);
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
      userId: employee.user_id,
      name: employee.name,
      roleTitle: employee.role_title,
      contactPhone: employee.contact_phone,
      address: employee.address,
      baseSalary: Number(employee.base_salary),
      commissionRate: employee.commission_rate ? Number(employee.commission_rate) : null,
      hireDate: employee.hire_date,
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


