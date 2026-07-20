
const express = require('express');
const UsersController = require('./users.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware, permissionMiddleware(PERMISSIONS.USERS_MANAGE));

// NOTE: /permissions/catalog must be registered before /:id.
router.get('/permissions/catalog', UsersController.getPermissionCatalog);

router.get('/', UsersController.getAll);
router.get('/:id', UsersController.getById);
router.post('/', UsersController.create);
router.put('/:id', UsersController.update);
router.put('/:id/permissions', UsersController.setPermissions);
router.delete('/:id', UsersController.deactivate);

module.exports = router;
