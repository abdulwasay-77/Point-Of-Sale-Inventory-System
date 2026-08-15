const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const errorHandler = require('./middleware/errorHandler');
const tenantMiddleware = require('./middleware/tenantMiddleware');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./modules/auth/auth.routes');
const categoriesRoutes = require('./modules/categories/categories.routes');
const variationsRoutes = require('./modules/variations/variations.routes');
const unitsRoutes = require('./modules/units-of-measure/units.routes');
const productsRoutes = require('./modules/products/products.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const suppliersRoutes = require('./modules/suppliers/suppliers.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const purchasesRoutes = require('./modules/purchases/purchases.routes');
const salesRoutes = require('./modules/sales/sales.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const payrollRoutes = require('./modules/payroll/payroll.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');
const usersRoutes = require('./modules/users/users.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const chatbotRoutes = require('./modules/chatbot/chatbot.routes');
const warehousesRoutes = require('./modules/warehouses/warehouses.routes');
const transfersRoutes = require('./modules/transfers/transfers.routes');
const kitsRoutes = require('./modules/kits/kits.routes');
const creditRoutes = require('./modules/credit/credit.routes');
const installmentsRoutes = require('./modules/installments/installments.routes');
const profileRoutes = require('./modules/profile/profile.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const platformAuthRoutes = require('./modules/platform/platformAuth.routes');
const platformBusinessRoutes = require('./modules/platform/business.routes');
const platformPlansRoutes = require('./modules/platform/plans.routes');
const platformPayoutMethodsRoutes = require('./modules/platform/payoutMethods.routes');
const platformPaymentSubmissionsRoutes = require('./modules/platform/paymentSubmissions.routes');
const billingRoutes = require('./modules/billing/billing.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded product images statically, e.g. /uploads/products/xyz.jpg
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Resolves req.tenantBusiness from the request's subdomain (see
// middleware/tenantMiddleware.js) — runs globally, before every route
// below, including unauthenticated ones (/api/settings/public,
// /api/auth/login) which need to know the tenant before any user/token
// is involved. No-ops (req.tenantBusiness = null) when APP_DOMAIN isn't
// set or the request has no recognizable subdomain, so this is safe to
// run even in single-tenant/local setups.
app.use(tenantMiddleware);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/variations', variationsRoutes);
app.use('/api/units-of-measure', unitsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/warehouses', warehousesRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/kits', kitsRoutes);
app.use('/api/credit', creditRoutes);
app.use('/api/installments', installmentsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/billing', billingRoutes);

// Platform / Super Admin routes — never share a router with the tenant
// routes above. Authenticated by platformAuthMiddleware.js, a
// completely separate token type from every route above it (see
// authMiddleware.js, which explicitly rejects platform tokens, and
// platformAuthMiddleware.js, which explicitly rejects tenant tokens).
app.use('/api/platform/auth', platformAuthRoutes);
app.use('/api/platform/businesses', platformBusinessRoutes);
app.use('/api/platform/plans', platformPlansRoutes);
app.use('/api/platform/payout-methods', platformPayoutMethodsRoutes);
app.use('/api/platform/payment-submissions', platformPaymentSubmissionsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
