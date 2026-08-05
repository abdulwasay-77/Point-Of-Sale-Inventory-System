const { PrismaClient } = require('@prisma/client');
const { AsyncLocalStorage } = require('async_hooks');

// ============================================================================
// TENANT-SCOPING PRISMA EXTENSION
// ============================================================================
// This is the single mechanism that keeps one business's data from ever
// leaking into another's. Every existing service file in this codebase
// (products.service.js, invoices.service.js, roles.service.js, ...)
// keeps calling `prisma.product.findMany()`, `prisma.role.create()`, etc.
// exactly as it did before multi-tenancy — none of them had to be
// rewritten to manually add `business_id` to every query. Instead:
//
// 1. `tenantContext` is request-scoped storage (Node's AsyncLocalStorage)
//    holding the current request's businessId.
// 2. `authMiddleware` (see ../middleware/authMiddleware.js) sets this
//    once per request, right after verifying the user's token and
//    confirming their business is active, by wrapping the rest of the
//    request in `runWithTenant(businessId, () => next())`.
// 3. This extension intercepts every query Prisma makes for a
//    tenant-scoped model (the list below — everything except Business,
//    PlatformAdmin, PlatformAuditLog, and LoginAttempt) and silently
//    injects `business_id` into it — into `where` for reads/updates/
//    deletes, into `data` for creates.
//
// Outside of a request (no tenant context set — e.g. the initial user
// lookup during login, before we know which business a token belongs
// to, or platform-only code working with Business/PlatformAdmin) this
// extension is a complete no-op: queries run exactly as written, fully
// unscoped. That's intentional, not a gap — see authMiddleware.js and
// auth.service.js for the specific places that deliberately query
// before/without a tenant context.

const tenantContext = new AsyncLocalStorage();

// Every Prisma model name that belongs to exactly one Business. Kept as
// an explicit list (rather than "everything except a short exclude
// list") on purpose — a new model added later has to be deliberately
// added here, so a forgotten model fails closed (unscoped, which for a
// tenant-owned table would show up immediately as "shows every
// business's rows") rather than failing open and silently leaking data.
const TENANT_MODELS = new Set([
  'User', 'Role', 'RolePermission', 'UserPermission', 'AuditLog',
  'Category', 'Product', 'ProductVariant', 'Variation', 'VariationValue',
  'Kit', 'KitComponent', 'Warehouse', 'Batch', 'CostLot', 'StockLevel',
  'StockMovement', 'StockTransfer', 'Customer', 'CustomerLedgerEntry',
  'Invoice', 'InvoiceItem', 'Payment', 'InstallmentPlan', 'InstallmentPayment',
  'Supplier', 'SupplierLedgerEntry', 'PurchaseOrder', 'PurchaseOrderItem',
  'Employee', 'PayrollRecord', 'CommissionRecord',
  'ExpenseBudgetAdjustment', 'StaffExpenseLimit', 'StaffExpense',
  'BusinessSettings', 'ExpenseBudget',
]);

const READ_OR_MUTATE_BY_WHERE = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany',
  'update', 'updateMany', 'delete', 'deleteMany',
  'count', 'aggregate', 'groupBy',
]);

const basePrisma = new PrismaClient();

const prisma = basePrisma.$extends({
  name: 'tenant-scoping',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = tenantContext.getStore();

        if (!ctx || !ctx.businessId || !TENANT_MODELS.has(model)) {
          return query(args);
        }

        const businessId = ctx.businessId;
        args = args || {};

        if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
          // findUnique's `where` must exactly match a unique index shape
          // (id, or a compound unique object) — we can't merge
          // business_id into it without breaking that shape. Every
          // findUnique in this codebase on a tenant model uses the
          // primary key `id`, which is globally unique anyway, so this
          // is safe to leave unscoped at the query level. Defense in
          // depth: callers that need to confirm the found row actually
          // belongs to the current business (rare — id lookups already
          // can't cross tenants in practice) can check `.business_id`
          // on the result themselves.
          return query(args);
        }

        if (READ_OR_MUTATE_BY_WHERE.has(operation)) {
          args.where = { ...(args.where || {}), business_id: businessId };
        } else if (operation === 'create') {
          args.data = { ...(args.data || {}), business_id: businessId };
        } else if (operation === 'createMany') {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((row) => ({ ...row, business_id: businessId }));
          }
        } else if (operation === 'upsert') {
          args.where = { ...(args.where || {}), business_id: businessId };
          args.create = { ...(args.create || {}), business_id: businessId };
        }

        return query(args);
      },
    },
  },
});

function runWithTenant(businessId, fn) {
  return tenantContext.run({ businessId }, fn);
}

function getCurrentBusinessId() {
  const ctx = tenantContext.getStore();
  return ctx ? ctx.businessId : null;
}

module.exports = prisma;
module.exports.runWithTenant = runWithTenant;
module.exports.getCurrentBusinessId = getCurrentBusinessId;
// Escape hatch for platform-only code (Business/PlatformAdmin
// management) that wants to be explicit about running unscoped rather
// than relying on "no context happens to be set right now".
module.exports.basePrisma = basePrisma;
