
const PayrollService = require('./payroll.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class PayrollController {
  getEmployees = asyncHandler(async (req, res) => {
    const employees = await PayrollService.getAllEmployees();
    success(res, employees);
  });

  getRecords = asyncHandler(async (req, res) => {
    const records = await PayrollService.getRecords(req.query.employeeId);
    success(res, records);
  });

  generate = asyncHandler(async (req, res) => {
    const { employeeId, periodStart, periodEnd } = req.body;
    if (!employeeId || !periodStart || !periodEnd) {
      return res
        .status(400)
        .json({ success: false, message: 'employeeId, periodStart and periodEnd are required' });
    }
    const record = await PayrollService.generate({
      employeeId,
      periodStart,
      periodEnd,
      createdBy: req.user.userId,
    });
    created(res, record, 'Payroll record generated');
  });

  markPaid = asyncHandler(async (req, res) => {
    const record = await PayrollService.markPaid(req.params.id);
    success(res, record, 'Marked as paid');
  });
}

module.exports = new PayrollController();
