import axiosInstance from './axiosInstance'

// CustomerCredit — outstanding balances, recording payments, late fees.
export const creditService = {
  getOutstanding: () => axiosInstance.get('/credit'),
  getHistory: () => axiosInstance.get('/credit/history'),
  getInProgress: () => axiosInstance.get('/credit/in-progress'),
  getByCustomer: (customerId) => axiosInstance.get(`/credit/customer/${customerId}`),
  recordPayment: (invoiceId, data) => axiosInstance.post(`/credit/${invoiceId}/payment`, data),
  chargeLateFee: (invoiceId, data) => axiosInstance.post(`/credit/${invoiceId}/late-fee`, data),
}