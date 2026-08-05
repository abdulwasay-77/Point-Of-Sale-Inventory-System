
const express = require('express');
const TransfersController = require('./transfers.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware(PERMISSIONS.TRANSFERS_VIEW), TransfersController.getAll);
router.post('/', permissionMiddleware(PERMISSIONS.TRANSFERS_CREATE), TransfersController.create);

module.exports = router;
