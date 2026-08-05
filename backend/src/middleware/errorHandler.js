

const logger = require('../utils/logger');

// Central error handler — mounted last in app.js. Any controller that
// calls next(error) (or throws inside an async handler wrapped by
// asyncHandler) ends up here. Two rules this file exists to enforce:
//
//  1. The person using the app should NEVER see a raw database detail —
//     no column names, no "business_id", no constraint names, no Prisma
//     error codes. Every branch below translates those into a plain
//     sentence about the thing they were actually trying to do.
//  2. Only errors a service DELIBERATELY threw (recognizable by having
//     `err.status` set — see the `const err = new Error(...); err.status
//     = 409; throw err;` pattern used throughout every *.service.js
//     file) get their message shown to the user as-is, because those
//     were already written to be user-facing. Anything else (a real bug,
//     a DB connection drop, a typo in a query) is an unexpected error —
//     its real message goes to the server log for us to debug, and the
//     user gets a safe, generic sentence instead of a leaked stack/error
//     string.

// Maps a request's route prefix (req.baseUrl) to the human name of the
// thing being created/edited there, for building sentences like "A
// category with this name already exists." Falls back to a
// field-only sentence ("This name is already in use.") for any route
// not listed here, so a new module never produces a broken message —
// just a slightly less specific one, until it's added here.
const RESOURCE_BY_ROUTE = {
  '/api/categories': { name: 'category', article: 'A' },
  '/api/roles': { name: 'role', article: 'A' },
  '/api/variations': { name: 'variation', article: 'A' },
  '/api/products': { name: 'product', article: 'A' },
  '/api/kits': { name: 'kit', article: 'A' },
  '/api/sales': { name: 'invoice', article: 'An' },
  '/api/purchases': { name: 'purchase order', article: 'A' },
  '/api/users': { name: 'user', article: 'A' },
  '/api/warehouses': { name: 'warehouse', article: 'A' },
  '/api/customers': { name: 'customer', article: 'A' },
  '/api/suppliers': { name: 'supplier', article: 'A' },
  '/api/platform/businesses': { name: 'business', article: 'A' },
};

// Humanizes a single column name into what a user actually typed into a
// form — "invoice_number" -> "invoice number", "sku" -> "SKU". Anything
// not listed just gets its underscores swapped for spaces.
const FIELD_LABELS = {
  name: 'name',
  sku: 'SKU',
  barcode: 'barcode',
  invoice_number: 'invoice number',
  po_number: 'PO number',
  email: 'email address',
  slug: 'URL',
};

// Compound unique constraints where no single field reads naturally on
// its own — keyed by the constraint's column set (sorted, so field
// order in the Prisma error doesn't matter), each with its own plain-
// English sentence. Business_id is never a key here — it's stripped
// from every P2002 error before this table is even consulted, since a
// user should never see it regardless of which constraint fired.
const COMPOUND_MESSAGES = {
  'product_id,variation_value_id': 'This product already has that exact variant combination.',
  'value,variation_id': 'This value already exists for this variation.',
  'component_product_id,kit_id': 'This product is already a component of this kit.',
  'batch_number,product_id': 'This batch number is already used for this product.',
  'plan_id,sequence': 'This installment number already exists for this plan.',
  'employee_id,invoice_id': 'A commission record already exists for this sale and employee.',
  'permission,role_id': 'This permission is already assigned to this role.',
  'permission,user_id': 'This permission override already exists for this user.',
  'batch_id,product_id,variant_id,warehouse_id': 'A stock record already exists for this exact product, batch, and warehouse.',
  'invoice_id': 'This invoice already has an installment plan.',
  'user_id': 'This person is already linked to an employee record.',
  'employee_id': 'An expense limit already exists for this employee.',
};

function friendlyDuplicateMessage(err, req) {
  const rawTarget = Array.isArray(err.meta?.target) ? err.meta.target : [err.meta?.target].filter(Boolean);
  const fields = rawTarget.filter((f) => f && f !== 'business_id');

  if (fields.length === 0) {
    // Only business_id was in the target (a platform-internal
    // safeguard, e.g. BusinessSettings/ExpenseBudget's one-row-per-
    // business constraint) — not something a normal user action should
    // ever be able to trigger.
    return 'That already exists. Please refresh and try again.';
  }

  if (fields.length === 1) {
    const field = fields[0];
    const resource = RESOURCE_BY_ROUTE[req.baseUrl];
    const label = FIELD_LABELS[field] || field.replace(/_/g, ' ');
    if (field === 'email') {
      return 'An account with this email address already exists.';
    }
    if (resource) {
      return `${resource.article} ${resource.name} with this ${label} already exists.`;
    }
    return `This ${label} is already in use. Please use a different one.`;
  }

  const key = [...fields].sort().join(',');
  return COMPOUND_MESSAGES[key] || 'That already exists. Please use a different value.';
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logger.error(`${req.method} ${req.originalUrl} ->`, err.message);

  // Prisma "record not found" — e.g. editing/deleting something another
  // tab already deleted.
  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, message: 'That record no longer exists — it may have just been deleted.' });
  }

  // Prisma unique constraint violation — the one behind the bug report
  // this fix addresses. Never surface err.meta.target (raw column
  // names, including "business_id") directly to the user.
  if (err.code === 'P2002') {
    return res.status(409).json({ success: false, message: friendlyDuplicateMessage(err, req) });
  }

  // Prisma foreign key constraint violation. Most commonly hit when a
  // logged-in user's JWT still references a user id that no longer
  // exists in the database — e.g. right after `prisma migrate reset`
  // wipes and reseeds the users table with new ids, but the browser is
  // still holding an old token. Surface a message that tells the user
  // what to actually do instead of a raw Prisma stack trace.
  if (err.code === 'P2003') {
    const field = err.meta?.field_name || '';
    if (field.includes('created_by') || field.includes('user')) {
      return res.status(401).json({
        success: false,
        message: 'Your session refers to an account that no longer exists (likely after a database reset). Please log out and log back in.',
      });
    }
    return res.status(409).json({
      success: false,
      message: 'This action references something that no longer exists. Please refresh the page and try again.',
    });
  }

  // Any other error surfaced by Prisma itself (bad query shape, DB
  // connection drop, etc.) — these are bugs or infra issues, not
  // something a user did wrong, so they get the same safe generic
  // message as any other unexpected error below, not their raw
  // Prisma-internal text.
  if (err.name === 'PrismaClientValidationError' || err.name === 'PrismaClientKnownRequestError' || err.name === 'PrismaClientInitializationError') {
    return res.status(500).json({ success: false, message: 'Something went wrong on our end. Please try again in a moment.' });
  }

  const statusCode = err.status || err.statusCode || 500;

  // err.status being set is what marks an error as deliberately thrown
  // by a service to be shown to the user (see every *.service.js file's
  // `const err = new Error('...'); err.status = ...; throw err;`
  // pattern) — its message is safe and meant to be read. Anything
  // without that (a genuine bug — a null reference, a typo, whatever)
  // is unexpected: its real message is already logged above for us to
  // debug, but the user gets a safe generic sentence instead of
  // whatever that error's raw .message happens to say.
  const isDeliberateAppError = Boolean(err.status || err.statusCode);
  const message = isDeliberateAppError ? err.message : 'Something went wrong. Please try again.';

  res.status(statusCode).json({ success: false, message });
}

module.exports = errorHandler;

