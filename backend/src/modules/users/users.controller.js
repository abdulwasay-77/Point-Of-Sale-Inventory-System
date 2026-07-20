
const UsersService = require('./users.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class UsersController {
  getAll = asyncHandler(async (req, res) => {
    const users = await UsersService.getAll();
    success(res, users);
  });

  getPermissionCatalog = asyncHandler(async (req, res) => {
    success(res, UsersService.getPermissionCatalog());
  });

  getById = asyncHandler(async (req, res) => {
    const user = await UsersService.getById(req.params.id);
    success(res, user);
  });

  create = asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res
        .status(400)
        .json({ success: false, message: 'name, email, password and role are required' });
    }
    const user = await UsersService.create({ name, email, password, role });
    created(res, user, 'User created');
  });

  update = asyncHandler(async (req, res) => {
    const user = await UsersService.update(req.params.id, req.body);
    success(res, user, 'User updated');
  });

  deactivate = asyncHandler(async (req, res) => {
    const user = await UsersService.deactivate(req.params.id);
    success(res, user, 'User deactivated');
  });

  setPermissions = asyncHandler(async (req, res) => {
    if (!Array.isArray(req.body.permissions)) {
      return res.status(400).json({ success: false, message: 'permissions array is required' });
    }
    const user = await UsersService.setPermissions(req.params.id, req.body.permissions);
    success(res, user, 'Permissions updated');
  });
}

module.exports = new UsersController();
