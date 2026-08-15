import platformAxiosInstance from './platformAxiosInstance'

export const platformBillingService = {
  getPlans: () => platformAxiosInstance.get('/plans'),
  createPlan: (data) => platformAxiosInstance.post('/plans', data),
  updatePlan: (id, data) => platformAxiosInstance.put(`/plans/${id}`, data),
  deactivatePlan: (id) => platformAxiosInstance.patch(`/plans/${id}/deactivate`),
  getPayoutMethods: () => platformAxiosInstance.get('/payout-methods'),
  createPayoutMethod: (data) => platformAxiosInstance.post('/payout-methods', data),
  updatePayoutMethod: (id, data) => platformAxiosInstance.put(`/payout-methods/${id}`, data),
  deactivatePayoutMethod: (id) => platformAxiosInstance.patch(`/payout-methods/${id}/deactivate`),
  getSubmissions: (params) => platformAxiosInstance.get('/payment-submissions', { params }),
  approveSubmission: (id) => platformAxiosInstance.post(`/payment-submissions/${id}/approve`),
  rejectSubmission: (id, reason) => platformAxiosInstance.post(`/payment-submissions/${id}/reject`, { reason }),
}
