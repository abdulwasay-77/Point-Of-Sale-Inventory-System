const RolesService = require('./roles.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class RolesController {
  getAll = asyncHandler(async (req, res) => {
    const roles = await RolesService.getAll();
    success(res, roles);
  });

  create = asyncHandler(async (req, res) => {
    const { name, permissions } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Role name is required.' });
    }
    const role = await RolesService.create({ name, permissions });
    created(res, role, 'Role created');
  });

  update = asyncHandler(async (req, res) => {
    const role = await RolesService.update(req.params.id, req.body);
    success(res, role, 'Role updated');
  });

  remove = asyncHandler(async (req, res) => {
    await RolesService.remove(req.params.id);
    success(res, null, 'Role deleted');
  });
}

module.exports = new RolesController();