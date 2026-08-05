const express = require('express');
const router = express.Router();
const platformAuthMiddleware = require('../../middleware/platformAuthMiddleware');
const {
  getAll, getById, create, setStatus, setModules, setMaxAdminSeats, resetPrimaryAdminPassword, updateInfo,
} = require('./business.controller');

router.use(platformAuthMiddleware);

router.get('/', getAll);
router.get('/:id', getById);
router.post('/', create);
router.patch('/:id', updateInfo);
router.patch('/:id/status', setStatus);
router.patch('/:id/modules', setModules);
router.patch('/:id/admin-seats', setMaxAdminSeats);
router.post('/:id/reset-admin-password', resetPrimaryAdminPassword);

module.exports = router;