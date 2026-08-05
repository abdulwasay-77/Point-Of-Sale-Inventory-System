
const express = require('express');
const SuppliersController = require('./suppliers.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

router.get('/', SuppliersController.getAll);
router.get('/:id', SuppliersController.getById);
router.get('/:id/ledger', SuppliersController.getLedger);
router.post('/:id/payments', permissionMiddleware(PERMISSIONS.SUPPLIERS_MANAGE), SuppliersController.recordPayment);
router.post('/', permissionMiddleware(PERMISSIONS.SUPPLIERS_MANAGE), SuppliersController.create);
router.put('/:id', permissionMiddleware(PERMISSIONS.SUPPLIERS_MANAGE), SuppliersController.update);
router.delete('/:id', permissionMiddleware(PERMISSIONS.SUPPLIERS_MANAGE), SuppliersController.remove);

module.exports = router;
