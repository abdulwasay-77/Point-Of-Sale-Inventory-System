
const express = require('express');
const WarehousesController = require('./warehouses.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

router.get('/', WarehousesController.getAll);
router.get('/:id', WarehousesController.getById);
router.post('/', permissionMiddleware(PERMISSIONS.WAREHOUSES_MANAGE), WarehousesController.create);
router.put('/:id', permissionMiddleware(PERMISSIONS.WAREHOUSES_MANAGE), WarehousesController.update);
router.delete('/:id', permissionMiddleware(PERMISSIONS.WAREHOUSES_MANAGE), WarehousesController.deactivate);

module.exports = router;
