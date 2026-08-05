
const PurchasesService = require('./purchases.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class PurchasesController {
  getAll = asyncHandler(async (req, res) => {
    const purchases = await PurchasesService.getAll();
    success(res, purchases);
  });

  getById = asyncHandler(async (req, res) => {
    const purchase = await PurchasesService.getById(req.params.id);
    success(res, purchase);
  });

  create = asyncHandler(async (req, res) => {
    const supplierId = req.body.supplierId || req.body.supplier_id;
    if (!supplierId || !Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'supplierId and at least one item are required' });
    }
    const purchase = await PurchasesService.create({
      supplierId,
      warehouseId: req.body.warehouseId,
      items: req.body.items,
      createdBy: req.user?.userId,
    });
    created(res, purchase, 'Purchase recorded');
  });
}

module.exports = new PurchasesController();
