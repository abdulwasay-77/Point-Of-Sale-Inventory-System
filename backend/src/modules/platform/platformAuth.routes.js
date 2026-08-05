const express = require('express');
const router = express.Router();
const platformAuthMiddleware = require('../../middleware/platformAuthMiddleware');
const { login, me } = require('./platformAuth.controller');

router.post('/login', login);
router.get('/me', platformAuthMiddleware, me);

module.exports = router;
