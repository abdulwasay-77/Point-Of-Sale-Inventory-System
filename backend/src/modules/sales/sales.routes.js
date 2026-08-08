const express = require('express');
const SalesController = require('./sales.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

// NOTE: /checkout must be registered before /:id so it isn't swallowed by it.
router.post('/checkout', permissionMiddleware(PERMISSIONS.SALES_CHECKOUT), SalesController.checkout);
// Same reasoning as /checkout above: register before the generic /:id GET
// route so '/some-invoice-id/abandon' isn't ever misread as a plain
// getById('some-invoice-id/abandon'). Gated by SALES_CHECKOUT (not
// SALES_VIEW) since this is really "undo the checkout I just did", not a
// sales-history/reporting action.
router.post('/:id/abandon', permissionMiddleware(PERMISSIONS.SALES_CHECKOUT), SalesController.abandon);
// Same reasoning again: a fixed-path GET registered before the generic
// GET /:id below, so '/customer-last-batch' is never misread as
// getById('customer-last-batch'). Gated by SALES_CHECKOUT (not
// SALES_VIEW) since this is part of the active checkout flow — the same
// permission that already covers seeing/acting on the cart before a sale
// is finalized — not sales history/reporting.
router.get('/customer-last-batch', permissionMiddleware(PERMISSIONS.SALES_CHECKOUT), SalesController.getCustomerLastBatch);
router.get('/', permissionMiddleware(PERMISSIONS.SALES_VIEW), SalesController.getAll);
router.get('/:id', permissionMiddleware(PERMISSIONS.SALES_VIEW), SalesController.getById);

module.exports = router;