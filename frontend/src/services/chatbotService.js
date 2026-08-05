
import axiosInstance from './axiosInstance'

// Chatbot API layer — a single endpoint that handles both new questions
// and confirming a previously-proposed action (see pendingAction).
export const chatbotService = {
  sendMessage: (message, pendingAction = null) =>
    axiosInstance.post('/chatbot/message', { message, pendingAction }),
}
