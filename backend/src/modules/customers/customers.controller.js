
const CustomersService = require('./customers.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class CustomersController {
  getAll = asyncHandler(async (req, res) => {
    const customers = await CustomersService.getAll();
    success(res, customers);
  });

  getById = asyncHandler(async (req, res) => {
    const customer = await CustomersService.getById(req.params.id);
    success(res, customer);
  });

  create = asyncHandler(async (req, res) => {
    if (!req.body.name || !(req.body.phone || req.body.contact_phone)) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }
    const customer = await CustomersService.create(req.body);
    created(res, customer, 'Customer created');
  });

  update = asyncHandler(async (req, res) => {
    const customer = await CustomersService.update(req.params.id, req.body);
    success(res, customer, 'Customer updated');
  });

  remove = asyncHandler(async (req, res) => {
    await CustomersService.remove(req.params.id);
    success(res, null, 'Customer removed');
  });
}

module.exports = new CustomersController();
