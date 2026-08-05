const express = require('express');
const ProfileController = require('./profile.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const upload = require('../../middleware/upload').avatar;

const router = express.Router();

// No permissionMiddleware here on purpose — every logged-in user can
// view/edit their OWN profile, regardless of role. Admin-managed fields
// (salary, role title, ...) simply aren't accepted by the service layer
// itself, not gated by a permission check here.
router.use(authMiddleware);

router.get('/', ProfileController.getProfile);
router.put('/', ProfileController.updateProfile);
router.post('/avatar', upload.single('avatar'), ProfileController.updateAvatar);
router.delete('/avatar', ProfileController.removeAvatar);
router.put('/theme', ProfileController.updateTheme);
router.post('/change-password', ProfileController.changePassword);

module.exports = router;