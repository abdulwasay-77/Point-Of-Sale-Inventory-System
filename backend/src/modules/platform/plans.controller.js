const asyncHandler = require('../../utils/asyncHandler'); const { success, created } = require('../../utils/apiResponse'); const service = require('./plans.service');
const list = asyncHandler(async (req, res) => success(res, await service.list()));
const create = asyncHandler(async (req, res) => created(res, await service.create(req.body), 'Plan created'));
const update = asyncHandler(async (req, res) => success(res, await service.update(req.params.id, req.body), 'Plan updated'));
const deactivate = asyncHandler(async (req, res) => success(res, await service.deactivate(req.params.id), 'Plan deactivated'));
module.exports = { list, create, update, deactivate };
