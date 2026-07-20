
import axiosInstance from './axiosInstance'

// Stock transfer API layer — moving inventory between warehouses.
export const transferService = {
  getAll: () => axiosInstance.get('/transfers'),
  create: (data) => axiosInstance.post('/transfers', data),
}
