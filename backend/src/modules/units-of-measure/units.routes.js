const express = require('express');
const UnitsController = require('./units.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware, permissionMiddleware(PERMISSIONS.UNITS_MANAGE));

router.get('/', UnitsController.getAll);
router.post('/', UnitsController.create);
router.put('/:id', UnitsController.update);
router.delete('/:id', UnitsController.remove);

module.exports = router;
