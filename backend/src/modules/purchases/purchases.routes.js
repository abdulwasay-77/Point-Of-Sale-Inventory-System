
const express = require('express');
const PurchasesController = require('./purchases.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware(PERMISSIONS.PURCHASES_VIEW), PurchasesController.getAll);
router.get('/:id', permissionMiddleware(PERMISSIONS.PURCHASES_VIEW), PurchasesController.getById);
router.post('/', permissionMiddleware(PERMISSIONS.PURCHASES_CREATE), PurchasesController.create);

module.exports = router;
