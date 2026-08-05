
const CategoriesService = require('./categories.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');

class CategoriesController {
  getAll = asyncHandler(async (req, res) => {
    const categories = await CategoriesService.getAll();
    success(res, categories);
  });

  getById = asyncHandler(async (req, res) => {
    const category = await CategoriesService.getById(req.params.id);
    success(res, category);
  });

  create = asyncHandler(async (req, res) => {
    if (!req.body.name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    const category = await CategoriesService.create(req.body);
    created(res, category, 'Category created');
  });

  update = asyncHandler(async (req, res) => {
    const category = await CategoriesService.update(req.params.id, req.body);
    success(res, category, 'Category updated');
  });

  remove = asyncHandler(async (req, res) => {
    await CategoriesService.remove(req.params.id);
    success(res, null, 'Category deleted');
  });
}

module.exports = new CategoriesController();
