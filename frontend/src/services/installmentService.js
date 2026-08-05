import axiosInstance from './axiosInstance'

// Installments — plans are created as part of POS checkout (see
// salesService.checkout); this covers listing/viewing/marking paid.
export const installmentService = {
  getAll: () => axiosInstance.get('/installments'),
  getById: (id) => axiosInstance.get(`/installments/${id}`),
  payInstallment: (planId, installmentId, data) =>
    axiosInstance.post(`/installments/${planId}/installments/${installmentId}/pay`, data),
}
