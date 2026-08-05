const CreditService = require('./credit.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class CreditController {
  getOutstanding = asyncHandler(async (req, res) => {
    const invoices = await CreditService.getOutstanding();
    success(res, invoices);
  });

  getHistory = asyncHandler(async (req, res) => {
    const invoices = await CreditService.getHistory();
    success(res, invoices);
  });

  getByCustomer = asyncHandler(async (req, res) => {
    const data = await CreditService.getByCustomer(req.params.customerId);
    success(res, data);
  });

  getInProgress = asyncHandler(async (req, res) => {
    const rows = await CreditService.getInProgress();
    success(res, rows);
  });

  recordPayment = asyncHandler(async (req, res) => {
    const { amount, method, referenceNo } = req.body;
    if (!amount) {
      return res.status(400).json({ success: false, message: 'Payment amount is required' });
    }
    const data = await CreditService.recordPayment(req.params.invoiceId, {
      amount,
      method,
      referenceNo,
      userId: req.user.userId,
    });
    success(res, data, 'Payment recorded');
  });

  chargeLateFee = asyncHandler(async (req, res) => {
    const { amount, note, dueDate } = req.body;
    if (!amount) {
      return res.status(400).json({ success: false, message: 'Late fee amount is required' });
    }
    const feeInvoice = await CreditService.chargeLateFee(req.params.invoiceId, {
      amount,
      note,
      dueDate,
      userId: req.user.userId,
    });
    created(res, feeInvoice, 'Late fee charged');
  });
}

module.exports = new CreditController();