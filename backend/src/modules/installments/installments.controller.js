const InstallmentsService = require('./installments.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success } = require('../../utils/apiResponse');

class InstallmentsController {
  getAll = asyncHandler(async (req, res) => {
    const plans = await InstallmentsService.getAll();
    success(res, plans);
  });

  getById = asyncHandler(async (req, res) => {
    const plan = await InstallmentsService.getById(req.params.id);
    success(res, plan);
  });

  payInstallment = asyncHandler(async (req, res) => {
    const { method, referenceNo } = req.body;
    const result = await InstallmentsService.payInstallment(req.params.id, req.params.installmentId, {
      method,
      referenceNo,
      userId: req.user.userId,
    });
    success(res, result, 'Installment marked paid');
  });
}

module.exports = new InstallmentsController();
