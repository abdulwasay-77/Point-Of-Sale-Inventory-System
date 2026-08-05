const VariationsService = require('./variations.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class VariationsController {
  getAll = asyncHandler(async (req, res) => {
    const variations = await VariationsService.getAll();
    success(res, variations);
  });

  getById = asyncHandler(async (req, res) => {
    const variation = await VariationsService.getById(req.params.id);
    success(res, variation);
  });

  create = asyncHandler(async (req, res) => {
    if (!req.body.name) {
      return res.status(400).json({ success: false, message: 'Variation name is required' });
    }
    const variation = await VariationsService.create(req.body);
    created(res, variation, 'Variation created');
  });

  update = asyncHandler(async (req, res) => {
    const variation = await VariationsService.update(req.params.id, req.body);
    success(res, variation, 'Variation updated');
  });

  remove = asyncHandler(async (req, res) => {
    await VariationsService.remove(req.params.id);
    success(res, null, 'Variation deleted');
  });

  addValue = asyncHandler(async (req, res) => {
    const value = await VariationsService.addValue(req.params.id, req.body);
    created(res, value, 'Value added');
  });

  updateValue = asyncHandler(async (req, res) => {
    const value = await VariationsService.updateValue(req.params.valueId, req.body);
    success(res, value, 'Value updated');
  });

  removeValue = asyncHandler(async (req, res) => {
    await VariationsService.removeValue(req.params.valueId);
    success(res, null, 'Value deleted');
  });
}

module.exports = new VariationsController();
