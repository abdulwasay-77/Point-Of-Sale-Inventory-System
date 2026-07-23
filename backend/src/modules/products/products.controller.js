
const ProductsService = require('./products.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success, created } = require('../../utils/apiResponse');
const { getEffectivePermissions } = require('../../utils/effectivePermissions');

class ProductsController {
  getAll = asyncHandler(async (req, res) => {
    const { q, categoryId } = req.query;
    const products = await ProductsService.getAll({ q, categoryId });
    success(res, products);
  });

  search = asyncHandler(async (req, res) => {
    const products = await ProductsService.search(req.query.q || '');
    success(res, products);
  });

  getById = asyncHandler(async (req, res) => {
    const product = await ProductsService.getById(req.params.id);
    success(res, product);
  });

  lookupByCode = asyncHandler(async (req, res) => {
    const product = await ProductsService.lookupByCode(req.params.code);
    if (!product) {
      return res.status(404).json({ success: false, message: 'No product matches that barcode/SKU' });
    }
    success(res, product);
  });

  getBatches = asyncHandler(async (req, res) => {
    const batches = await ProductsService.getBatches(req.params.id, req.query.variantId || null);
    success(res, batches);
  });

  // Gated by BARCODES_MANAGE at the route level (see products.routes.js) —
  // Admin only by default.
  generateBarcode = asyncHandler(async (req, res) => {
    const product = await ProductsService.generateBarcode(req.params.id);
    success(res, product, 'Barcode generated');
  });

  getVariants = asyncHandler(async (req, res) => {
    const variants = await ProductsService.getVariants(req.params.id);
    success(res, variants);
  });

  createVariant = asyncHandler(async (req, res) => {
    if (!req.body.variantName && !req.body.variant_name) {
      return res.status(400).json({ success: false, message: 'Variant name is required' });
    }
    if (!req.body.sku) {
      return res.status(400).json({ success: false, message: 'Variant SKU is required' });
    }
    const variant = await ProductsService.createVariant(req.params.id, {
      ...req.body,
      created_by: req.user?.userId,
    });
    created(res, variant, 'Variant created');
  });

  updateVariant = asyncHandler(async (req, res) => {
    const variant = await ProductsService.updateVariant(req.params.variantId, req.body);
    success(res, variant, 'Variant updated');
  });

  removeVariant = asyncHandler(async (req, res) => {
    await ProductsService.removeVariant(req.params.variantId);
    success(res, null, 'Variant removed');
  });

  create = asyncHandler(async (req, res) => {
    if (!req.body.name || !req.body.sku) {
      return res.status(400).json({ success: false, message: 'Name and SKU are required' });
    }
    const actorPermissions = await getEffectivePermissions(req.user.userId, req.user.role);
    const product = await ProductsService.create(
      { ...req.body, created_by: req.user?.userId },
      req.file,
      actorPermissions,
    );
    created(res, product, 'Product created');
  });

  update = asyncHandler(async (req, res) => {
    const actorPermissions = await getEffectivePermissions(req.user.userId, req.user.role);
    const product = await ProductsService.update(
      req.params.id,
      { ...req.body, created_by: req.user?.userId },
      req.file,
      actorPermissions,
    );
    success(res, product, 'Product updated');
  });

  remove = asyncHandler(async (req, res) => {
    await ProductsService.remove(req.params.id);
    success(res, null, 'Product removed');
  });
}

module.exports = new ProductsController();
