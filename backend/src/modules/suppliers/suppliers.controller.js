
const SuppliersService = require('./suppliers.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class SuppliersController {
  getAll = asyncHandler(async (req, res) => {
    const suppliers = await SuppliersService.getAll();
    success(res, suppliers);
  });

  getById = asyncHandler(async (req, res) => {
    const supplier = await SuppliersService.getById(req.params.id);
    success(res, supplier);
  });

  create = asyncHandler(async (req, res) => {
    if (!req.body.name || !(req.body.phone || req.body.contact_phone)) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }
    const supplier = await SuppliersService.create(req.body);
    created(res, supplier, 'Supplier created');
  });

  update = asyncHandler(async (req, res) => {
    const supplier = await SuppliersService.update(req.params.id, req.body);
    success(res, supplier, 'Supplier updated');
  });

  remove = asyncHandler(async (req, res) => {
    await SuppliersService.remove(req.params.id);
    success(res, null, 'Supplier removed');
  });

  getLedger = asyncHandler(async (req, res) => {
    success(res, await SuppliersService.getLedger(req.params.id));
  });

  recordPayment = asyncHandler(async (req, res) => {
    const { amount, method, referenceNo } = req.body;
    if (!amount) {
      return res.status(400).json({ success: false, message: 'amount is required' });
    }
    const ledger = await SuppliersService.recordPayment(req.params.id, {
      amount,
      method,
      referenceNo,
      createdBy: req.user.userId,
    });
    created(res, ledger, 'Payment recorded');
  });
}

module.exports = new SuppliersController();
