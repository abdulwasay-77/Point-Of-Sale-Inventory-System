const express = require('express');
const VariationsController = require('./variations.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

router.get('/', VariationsController.getAll);
router.get('/:id', VariationsController.getById);
router.post('/', permissionMiddleware(PERMISSIONS.VARIATIONS_MANAGE), VariationsController.create);
router.put('/:id', permissionMiddleware(PERMISSIONS.VARIATIONS_MANAGE), VariationsController.update);
router.delete('/:id', permissionMiddleware(PERMISSIONS.VARIATIONS_MANAGE), VariationsController.remove);

router.post('/:id/values', permissionMiddleware(PERMISSIONS.VARIATIONS_MANAGE), VariationsController.addValue);
router.put('/:id/values/:valueId', permissionMiddleware(PERMISSIONS.VARIATIONS_MANAGE), VariationsController.updateValue);
router.delete('/:id/values/:valueId', permissionMiddleware(PERMISSIONS.VARIATIONS_MANAGE), VariationsController.removeValue);

module.exports = router;
