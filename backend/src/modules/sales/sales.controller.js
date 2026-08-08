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

  getCustomerLastBatch = asyncHandler(async (req, res) => {
    const { customerId, productId, variantId } = req.query;
    if (!customerId || !productId) {
      return res.status(400).json({ success: false, message: 'customerId and productId are required' });
    }
    const result = await SalesService.getCustomerLastBatch(customerId, productId, variantId || null);
    success(res, result);
  });

  checkout = asyncHandler(async (req, res) => {
    const { customerId, items, warehouseId, paymentMethod, amountPaid, dueDate, installmentPlan } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    const invoice = await SalesService.checkout({
      customerId,
      items,
      warehouseId,
      paymentMethod,
      amountPaid,
      dueDate,
      installmentPlan,
      userId: req.user.userId,
    });
    created(res, invoice, 'Sale completed');
  });

  abandon = asyncHandler(async (req, res) => {
    const result = await SalesService.abandon(req.params.id, req.user.userId);
    success(res, result, 'Sale abandoned');
  });
}

module.exports = new SalesController();