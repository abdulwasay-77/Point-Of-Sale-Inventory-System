
const express = require('express');
const SalesController = require('./sales.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

// NOTE: /checkout must be registered before /:id so it isn't swallowed by it.
router.post('/checkout', permissionMiddleware(PERMISSIONS.SALES_CHECKOUT), SalesController.checkout);
router.get('/', permissionMiddleware(PERMISSIONS.SALES_VIEW), SalesController.getAll);
router.get('/:id', permissionMiddleware(PERMISSIONS.SALES_VIEW), SalesController.getById);

module.exports = router;
