import axiosInstance from './axiosInstance'

// Staff Expense Management API layer. Two permission tiers on the
// backend (see expenses.routes.js):
//   EXPENSES_RECORD — every staff member: log + view their own spend.
//   EXPENSES_MANAGE — Admin/Accountant by default: budget, per-staff
//     limits, recording on behalf of someone, voiding, full history.
export const expenseService = {
  // Everyone (EXPENSES_RECORD)
  recordMine: (data) => axiosInstance.post('/expenses/mine', data),
  getMyLimit: () => axiosInstance.get('/expenses/mine/limit'),
  getMyHistory: (params = {}) => axiosInstance.get('/expenses/mine/history', { params }),

  // Admin / Accountant — budget pool
  getBudget: () => axiosInstance.get('/expenses/budget'),
  setBudget: (data) => axiosInstance.put('/expenses/budget', data),
  setDefaultLimit: (data) => axiosInstance.put('/expenses/budget/default-limit', data),
  getAdjustments: () => axiosInstance.get('/expenses/budget/adjustments'),

  // Admin / Accountant — per-staff limits
  getLimits: () => axiosInstance.get('/expenses/limits'),
  setLimit: (data) => axiosInstance.put('/expenses/limits', data),
  clearLimit: (employeeId) => axiosInstance.delete(`/expenses/limits/${employeeId}`),

  // Admin / Accountant — record for someone, void, full history
  recordForEmployee: (data) => axiosInstance.post('/expenses', data),
  voidExpense: (id, reason) => axiosInstance.patch(`/expenses/${id}/void`, { reason }),
  getAllHistory: (params = {}) => axiosInstance.get('/expenses/history', { params }),
}