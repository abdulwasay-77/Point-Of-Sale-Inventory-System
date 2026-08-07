const UnitsService = require('./units.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class UnitsController {
  getAll = asyncHandler(async (req, res) => {
    const units = await UnitsService.getAll();
    success(res, units);
  });

  create = asyncHandler(async (req, res) => {
    const { name, abbreviation } = req.body;
    const unit = await UnitsService.create({ name, abbreviation });
    created(res, unit, 'Unit created');
  });

  update = asyncHandler(async (req, res) => {
    const unit = await UnitsService.update(req.params.id, req.body);
    success(res, unit, 'Unit updated');
  });

  remove = asyncHandler(async (req, res) => {
    await UnitsService.remove(req.params.id);
    success(res, null, 'Unit deleted');
  });
}

module.exports = new UnitsController();
