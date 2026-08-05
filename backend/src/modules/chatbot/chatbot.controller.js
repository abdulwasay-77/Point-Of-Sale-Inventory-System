
const ChatbotService = require('./chatbot.service');
const asyncHandler = require('../../utils/asyncHandler');
const { success } = require('../../utils/apiResponse');

class ChatbotController {
  message = asyncHandler(async (req, res) => {
    const { message, pendingAction } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }
    const result = await ChatbotService.handleMessage({
      message,
      pendingAction: pendingAction || null,
      user: req.user,
    });
    success(res, result);
  });
}

module.exports = new ChatbotController();
