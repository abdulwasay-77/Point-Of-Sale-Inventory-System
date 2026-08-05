
const express = require('express');
const KitsController = require('./kits.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

router.get('/', KitsController.getAll);
router.get('/:id', KitsController.getById);
router.post('/', permissionMiddleware(PERMISSIONS.KITS_MANAGE), KitsController.create);
router.put('/:id', permissionMiddleware(PERMISSIONS.KITS_MANAGE), KitsController.update);
router.delete('/:id', permissionMiddleware(PERMISSIONS.KITS_MANAGE), KitsController.remove);

module.exports = router;
