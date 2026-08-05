
const InventoryService = require('./inventory.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success } = require('../../utils/apiResponse');

class InventoryController {
  getAll = asyncHandler(async (req, res) => {
    const stock = await InventoryService.getAll();
    success(res, stock);
  });

  getLowStock = asyncHandler(async (req, res) => {
    const stock = await InventoryService.getLowStock();
    success(res, stock);
  });
}

module.exports = new InventoryController();
