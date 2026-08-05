const express = require('express');
const CustomersController = require('./customers.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

router.get('/', CustomersController.getAll);
router.get('/:id', CustomersController.getById);
// Purchase history for one customer — same view permission as the rest of
// the module (no separate flag: anyone who can see the customer list can
// see what a customer bought). See customers.controller.js#getPurchases.
router.get('/:id/purchases', CustomersController.getPurchases);
router.post('/', permissionMiddleware(PERMISSIONS.CUSTOMERS_MANAGE), CustomersController.create);
router.put('/:id', permissionMiddleware(PERMISSIONS.CUSTOMERS_MANAGE), CustomersController.update);
router.delete('/:id', permissionMiddleware(PERMISSIONS.CUSTOMERS_MANAGE), CustomersController.remove);

module.exports = router;