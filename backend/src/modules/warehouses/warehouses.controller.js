
const WarehousesService = require('./warehouses.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class WarehousesController {
  getAll = asyncHandler(async (req, res) => {
    success(res, await WarehousesService.getAll());
  });

  getById = asyncHandler(async (req, res) => {
    success(res, await WarehousesService.getById(req.params.id));
  });

  create = asyncHandler(async (req, res) => {
    if (!req.body.name) {
      return res.status(400).json({ success: false, message: 'Warehouse name is required' });
    }
    created(res, await WarehousesService.create(req.body), 'Warehouse created');
  });

  update = asyncHandler(async (req, res) => {
    success(res, await WarehousesService.update(req.params.id, req.body), 'Warehouse updated');
  });

  deactivate = asyncHandler(async (req, res) => {
    success(res, await WarehousesService.deactivate(req.params.id), 'Warehouse deactivated');
  });
}

module.exports = new WarehousesController();
