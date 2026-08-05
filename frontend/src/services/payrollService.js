import axiosInstance from './axiosInstance'

// Payroll API layer — Employee HR records + generated PayrollRecords.
// Gated server-side by PAYROLL_MANAGE (see payroll.routes.js).
export const payrollService = {
  // Employees
  getEmployees: () => axiosInstance.get('/payroll/employees'),
  createEmployee: (data) => axiosInstance.post('/payroll/employees', data),
  updateEmployee: (id, data) => axiosInstance.put(`/payroll/employees/${id}`, data),

  // Payroll records — optionally scoped to one employee.
  getRecords: (employeeId) =>
    axiosInstance.get('/payroll/records', { params: employeeId ? { employeeId } : {} }),
  generate: (data) => axiosInstance.post('/payroll/records', data),
  markPaid: (id) => axiosInstance.patch(`/payroll/records/${id}/pay`),
}