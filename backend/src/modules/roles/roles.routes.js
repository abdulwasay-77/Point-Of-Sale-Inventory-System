const express = require('express');
const RolesController = require('./roles.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

// Role management is part of the same admin privilege as user management
// (PERMISSION_CATALOG already labels USERS_MANAGE as "Manage users &
// roles") — anyone who can create a login can also decide what that
// login's role is allowed to do.
router.use(authMiddleware, permissionMiddleware(PERMISSIONS.USERS_MANAGE));

router.get('/', RolesController.getAll);
router.post('/', RolesController.create);
router.put('/:id', RolesController.update);
router.delete('/:id', RolesController.remove);

module.exports = router;