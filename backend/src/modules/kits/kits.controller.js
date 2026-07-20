
const KitsService = require('./kits.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class KitsController {
  getAll = asyncHandler(async (req, res) => {
    success(res, await KitsService.getAll());
  });

  getById = asyncHandler(async (req, res) => {
    success(res, await KitsService.getById(req.params.id));
  });

  create = asyncHandler(async (req, res) => {
    const { name, sku, kitPrice, components } = req.body;
    if (!name || !sku || !kitPrice) {
      return res.status(400).json({ success: false, message: 'name, sku and kitPrice are required' });
    }
    created(res, await KitsService.create({ name, sku, kitPrice, components }), 'Kit created');
  });

  update = asyncHandler(async (req, res) => {
    success(res, await KitsService.update(req.params.id, req.body), 'Kit updated');
  });

  remove = asyncHandler(async (req, res) => {
    await KitsService.remove(req.params.id);
    success(res, null, 'Kit removed');
  });
}

module.exports = new KitsController();
