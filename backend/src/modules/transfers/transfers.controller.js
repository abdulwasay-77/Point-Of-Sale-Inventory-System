
const TransfersService = require('./transfers.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class TransfersController {
  getAll = asyncHandler(async (req, res) => {
    success(res, await TransfersService.getAll());
  });

  create = asyncHandler(async (req, res) => {
    const { sourceWarehouseId, destinationWarehouseId, productId, batchId, quantity } = req.body;
    if (!sourceWarehouseId || !destinationWarehouseId || !productId || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'sourceWarehouseId, destinationWarehouseId, productId and quantity are required',
      });
    }
    const transfer = await TransfersService.create({
      sourceWarehouseId,
      destinationWarehouseId,
      productId,
      batchId,
      quantity,
      createdBy: req.user.userId,
    });
    created(res, transfer, 'Stock transferred');
  });
}

module.exports = new TransfersController();
