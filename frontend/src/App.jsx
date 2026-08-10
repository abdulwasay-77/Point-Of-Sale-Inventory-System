
import { Routes, Route } from 'react-router-dom'
import DashboardLayout from './layouts/DashboardLayout'
import AuthLayout from './layouts/AuthLayout'
import ProtectedRoute from './routes/ProtectedRoute'

import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import CategoriesPage from './pages/categories/CategoriesPage'
import VariationsPage from './pages/variations/VariationsPage'
import UnitsOfMeasurePage from './pages/units/UnitsOfMeasurePage'
import ProductsPage from './pages/products/ProductsPage'
import CustomersPage from './pages/customers/CustomersPage'
import CustomerPurchasesPage from './pages/customers/CustomerPurchasesPage'
import SuppliersPage from './pages/suppliers/SuppliersPage'
import PurchasesPage from './pages/purchases/PurchasesPage'
import InventoryPage from './pages/inventory/InventoryPage'
import PosPage from './pages/pos/PosPage'
import SalesHistoryPage from './pages/sales/SalesHistoryPage'
import InvoiceDetailPage from './pages/sales/InvoiceDetailPage'
import ReportsPage from './pages/reports/ReportsPage'
import ReportDetailPage from './pages/reports/ReportDetailPage'
import UserManagementPage from './pages/users/UserManagementPage'
import KitsPage from './pages/kits/KitsPage'
import WarehousesPage from './pages/warehouses/WarehousesPage'
import BarcodeLabelsPage from './pages/barcodes/BarcodeLabelsPage'
import CreditPage from './pages/credit/CreditPage'
import InstallmentsPage from './pages/installments/InstallmentsPage'
import ProfilePage from './pages/profile/ProfilePage'
import SettingsPage from './pages/settings/SettingsPage'
import PayrollPage from './pages/payroll/PayrollPage'
import ExpensesPage from './pages/expenses/ExpensesPage'
import NotFoundPage from './pages/errors/NotFoundPage'
import PlatformLoginPage from './pages/platform/PlatformLoginPage'
import PlatformDashboardPage from './pages/platform/PlatformDashboardPage'
import PlatformProtectedRoute from './routes/PlatformProtectedRoute'
import { useGlobalKeyboardNavigation } from './hooks/useGlobalKeyboardNavigation'

/**
 * Central route configuration.
 * - `/login` is public, wrapped in AuthLayout.
 * - Everything else sits under DashboardLayout and is guarded by
 *   ProtectedRoute (auth required; some pages also require a specific
 *   permission — see each route's requiredPermission below).
 */
export default function App() {
  useGlobalKeyboardNavigation()

  return (
    <>
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
        {/* Every route below is gated by its matching permission — same
            keys as Sidebar.jsx's PERMISSION_BY_LABEL and the backend's
            permissionMiddleware. This used to only be true for 5 routes
            (Suppliers/Reports/Users/Barcode Labels/Payroll); everything
            else was just "logged in" with no permission check, so a user
            with e.g. only DASHBOARD_VIEW could still open /products,
            /pos, /settings, etc. directly by URL even though the sidebar
            correctly hid those links. Only /profile stays permission-free
            — every logged-in user can see their own profile. */}
        <Route
          path="/"
          element={
            <ProtectedRoute requiredPermission="DASHBOARD_VIEW">
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products"
          element={
            <ProtectedRoute requiredPermission="PRODUCTS_VIEW">
              <ProductsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <ProtectedRoute requiredPermission="CATEGORIES_MANAGE">
              <CategoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/variations"
          element={
            <ProtectedRoute requiredPermission="VARIATIONS_MANAGE">
              <VariationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/units"
          element={
            <ProtectedRoute requiredPermission="UNITS_MANAGE">
              <UnitsOfMeasurePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute requiredPermission="CUSTOMERS_MANAGE">
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers/:customerId/purchases"
          element={
            <ProtectedRoute requiredPermission="CUSTOMERS_MANAGE">
              <CustomerPurchasesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchases"
          element={
            <ProtectedRoute requiredPermission="PURCHASES_VIEW">
              <PurchasesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute requiredPermission="INVENTORY_VIEW">
              <InventoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kits"
          element={
            <ProtectedRoute requiredPermission="KITS_MANAGE">
              <KitsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/warehouses"
          element={
            <ProtectedRoute requiredPermission="WAREHOUSES_MANAGE">
              <WarehousesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pos"
          element={
            <ProtectedRoute requiredPermission="SALES_CHECKOUT">
              <PosPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales"
          element={
            <ProtectedRoute requiredPermission="SALES_VIEW">
              <SalesHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales/:invoiceId"
          element={
            <ProtectedRoute requiredPermission="SALES_VIEW">
              <InvoiceDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/credit"
          element={
            <ProtectedRoute requiredPermission="CREDIT_MANAGE">
              <CreditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/installments"
          element={
            <ProtectedRoute requiredPermission="INSTALLMENTS_MANAGE">
              <InstallmentsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute requiredPermission="SETTINGS_MANAGE">
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute requiredPermission="SUPPLIERS_MANAGE">
              <SuppliersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute requiredPermission="REPORTS_VIEW">
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/generate/:reportKey"
          element={
            <ProtectedRoute requiredPermission="REPORTS_VIEW">
              <ReportDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredPermission="USERS_MANAGE">
              <UserManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/barcodes"
          element={
            <ProtectedRoute requiredPermission="BARCODES_MANAGE">
              <BarcodeLabelsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payroll"
          element={
            <ProtectedRoute requiredPermission="PAYROLL_MANAGE">
              <PayrollPage />
            </ProtectedRoute>
          }
        />
        {/* Staff Expense Management — module-level guard only requires
            EXPENSES_RECORD (every staff member has this by default), so
            everyone can reach the page and log/see their own spend. The
            admin-only tabs (Budget & Limits, All Staff History) inside
            ExpensesPage itself are further gated on EXPENSES_MANAGE. */}
        <Route
          path="/expenses"
          element={
            <ProtectedRoute requiredPermission="EXPENSES_RECORD">
              <ExpensesPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* 404 */}
      {/* Platform / Super Admin — deliberately outside AuthLayout and
          DashboardLayout entirely. These render their own full-page
          layout and are guarded by PlatformProtectedRoute, which checks
          a completely separate token (see platformAxiosInstance.js) —
          not the tenant ProtectedRoute/useAuth() above. */}
      <Route path="/platform/login" element={<PlatformLoginPage />} />
      <Route
        path="/platform/dashboard"
        element={
          <PlatformProtectedRoute>
            <PlatformDashboardPage />
          </PlatformProtectedRoute>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
