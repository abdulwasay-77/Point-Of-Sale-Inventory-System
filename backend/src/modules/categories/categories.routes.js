
const express = require('express');
const CategoriesController = require('./categories.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

router.get('/', CategoriesController.getAll);
router.get('/:id', CategoriesController.getById);
router.post('/', permissionMiddleware(PERMISSIONS.CATEGORIES_MANAGE), CategoriesController.create);
router.put('/:id', permissionMiddleware(PERMISSIONS.CATEGORIES_MANAGE), CategoriesController.update);
router.delete('/:id', permissionMiddleware(PERMISSIONS.CATEGORIES_MANAGE), CategoriesController.remove);

module.exports = router;
