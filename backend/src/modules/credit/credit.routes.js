const express = require('express');
const CreditController = require('./credit.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware, permissionMiddleware(PERMISSIONS.CREDIT_MANAGE));

router.get('/', CreditController.getOutstanding);
router.get('/history', CreditController.getHistory);
router.get('/in-progress', CreditController.getInProgress);
router.get('/customer/:customerId', CreditController.getByCustomer);
router.post('/:invoiceId/payment', CreditController.recordPayment);
router.post('/:invoiceId/late-fee', CreditController.chargeLateFee);

module.exports = router;