
const express = require('express');
const ChatbotController = require('./chatbot.controller');
const authMiddleware = require('../../middleware/authMiddleware');

const router = express.Router();

// Any logged-in staff member can talk to the chatbot; individual actions
// are separately gated by permission inside chatbot.service.js.
router.use(authMiddleware);
router.post('/message', ChatbotController.message);

module.exports = router;
