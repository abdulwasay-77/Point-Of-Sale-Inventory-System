
import { Routes, Route } from 'react-router-dom'
import DashboardLayout from './layouts/DashboardLayout'
import AuthLayout from './layouts/AuthLayout'
import ProtectedRoute from './routes/ProtectedRoute'

import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import CategoriesPage from './pages/categories/CategoriesPage'
import ProductsPage from './pages/products/ProductsPage'
import CustomersPage from './pages/customers/CustomersPage'
import SuppliersPage from './pages/suppliers/SuppliersPage'
import PurchasesPage from './pages/purchases/PurchasesPage'
import InventoryPage from './pages/inventory/InventoryPage'
import PosPage from './pages/pos/PosPage'
import SalesHistoryPage from './pages/sales/SalesHistoryPage'
import InvoiceDetailPage from './pages/sales/InvoiceDetailPage'
import ReportsPage from './pages/reports/ReportsPage'
import UserManagementPage from './pages/users/UserManagementPage'
import KitsPage from './pages/kits/KitsPage'
import WarehousesPage from './pages/warehouses/WarehousesPage'
import BarcodeLabelsPage from './pages/barcodes/BarcodeLabelsPage'
import NotFoundPage from './pages/errors/NotFoundPage'

/**
 * Central route configuration.
 * - `/login` is public, wrapped in AuthLayout.
 * - Everything else sits under DashboardLayout and is guarded by
 *   ProtectedRoute (auth required; some pages also restrict by role).
 */
export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Authenticated routes */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/kits" element={<KitsPage />} />
        <Route path="/warehouses" element={<WarehousesPage />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/sales" element={<SalesHistoryPage />} />
        <Route path="/sales/:invoiceId" element={<InvoiceDetailPage />} />

        {/* Admin-only routes */}
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <SuppliersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <UserManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/barcodes"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <BarcodeLabelsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
