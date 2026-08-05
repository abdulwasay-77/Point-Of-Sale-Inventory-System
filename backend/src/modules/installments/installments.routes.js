const express = require('express');
const InstallmentsController = require('./installments.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware, permissionMiddleware(PERMISSIONS.INSTALLMENTS_MANAGE));

router.get('/', InstallmentsController.getAll);
router.get('/:id', InstallmentsController.getById);
router.post('/:id/installments/:installmentId/pay', InstallmentsController.payInstallment);

module.exports = router;
