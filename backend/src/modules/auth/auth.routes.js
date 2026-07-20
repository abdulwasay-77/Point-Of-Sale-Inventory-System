
const express = require('express');
const AuthController = require('./auth.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const permissionMiddleware = require('../../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../../config/permissions');

const router = express.Router();

// Public routes
router.post('/login', AuthController.login);

// Protected routes
router.get('/me', authMiddleware, AuthController.me);
router.post('/logout', authMiddleware, AuthController.logout);

// Admin only routes (kept for compatibility — prefer POST /api/users, which
// does the same thing through the same USERS_MANAGE permission check)
router.post('/register', authMiddleware, permissionMiddleware(PERMISSIONS.USERS_MANAGE), AuthController.register);

module.exports = router;
