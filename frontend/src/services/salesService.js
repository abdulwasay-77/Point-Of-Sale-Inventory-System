import axiosInstance from './axiosInstance'

// Sales / POS checkout API layer.
export const salesService = {
  getAll: (params) => axiosInstance.get('/sales', { params }),
  getById: (id) => axiosInstance.get(`/sales/${id}`),
  // skipGlobalError: PosPage shows checkout failures (e.g. insufficient
  // stock) inline, right next to the cart and payment fields it
  // actually concerns — a modal popup would interrupt a flow that's
  // often retried immediately (adjust quantity, try again). See
  // GlobalErrorModal.jsx.
  checkout: (data) => axiosInstance.post('/sales/checkout', data, { skipGlobalError: true }),
  // Undoes a checkout the cashier never confirmed (closed the receipt
  // popup instead of clicking "Done") — see PosPage's handleAbandonInvoice.
  // skipGlobalError: this fires silently as a cleanup step when the
  // popup is dismissed; a failure here shouldn't interrupt the cashier
  // with an error modal since they're already back at an empty-looking
  // cart action, not mid-task.
  abandon: (id) => axiosInstance.post(`/sales/${id}/abandon`, {}, { skipGlobalError: true }),
}