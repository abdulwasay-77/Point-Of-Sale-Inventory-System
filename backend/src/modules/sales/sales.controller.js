

const SalesService = require('./sales.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class SalesController {
  getAll = asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const invoices = await SalesService.getAll({ from, to });
    success(res, invoices);
  });

  getById = asyncHandler(async (req, res) => {
    const invoice = await SalesService.getById(req.params.id);
    success(res, invoice);
  });

  checkout = asyncHandler(async (req, res) => {
    const { customerId, items, warehouseId, paymentMethod, amountPaid } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    const invoice = await SalesService.checkout({
      customerId,
      items,
      warehouseId,
      paymentMethod,
      amountPaid,
      userId: req.user.userId,
    });
    created(res, invoice, 'Sale completed');
  });
}

module.exports = new SalesController();
