const UnitsService = require('./units.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class UnitsController {
  getAll = asyncHandler(async (req, res) => success(res, await UnitsService.getAll()));

  create = asyncHandler(async (req, res) => {
    const unit = await UnitsService.create(req.body);
    created(res, unit, 'Unit created');
  });

  update = asyncHandler(async (req, res) => success(res, await UnitsService.update(req.params.id, req.body), 'Unit updated'));

  remove = asyncHandler(async (req, res) => {
    await UnitsService.remove(req.params.id);
    success(res, null, 'Unit deleted');
  });
}

module.exports = new UnitsController();