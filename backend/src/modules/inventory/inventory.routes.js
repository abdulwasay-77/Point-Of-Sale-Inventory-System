
const express = require('express');
const InventoryController = require('./inventory.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware, permissionMiddleware(PERMISSIONS.INVENTORY_VIEW));

// NOTE: /low-stock must be registered before any /:id-style route.
router.get('/low-stock', InventoryController.getLowStock);
router.get('/', InventoryController.getAll);

module.exports = router;
