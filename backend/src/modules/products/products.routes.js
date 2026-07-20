
const express = require('express');
const ProductsController = require('./products.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');
const upload = require('../../middleware/upload');

const router = express.Router();

router.use(authMiddleware);

// NOTE: /search and /lookup must be registered before /:id so they
// aren't swallowed by it.
router.get('/search', ProductsController.search);
router.get('/lookup/:code', ProductsController.lookupByCode);
router.get('/:id/batches', ProductsController.getBatches);
router.get('/', ProductsController.getAll);
router.get('/:id', ProductsController.getById);
router.post(
  '/',
  permissionMiddleware(PERMISSIONS.PRODUCTS_EDIT),
  upload.single('image'),
  ProductsController.create,
);
router.put(
  '/:id',
  permissionMiddleware(PERMISSIONS.PRODUCTS_EDIT),
  upload.single('image'),
  ProductsController.update,
);
router.delete('/:id', permissionMiddleware(PERMISSIONS.PRODUCTS_DELETE), ProductsController.remove);

module.exports = router;
