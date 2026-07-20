import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../common/Icon'
import { chatbotService } from '../../services/chatbotService'

const WELCOME = {
  role: 'bot',
  text: "Hi! Ask me about stock, prices, sales, customers or suppliers — or ask me to adjust stock, record a purchase, or add a customer (I'll always confirm before doing anything).",
}

/**
 * Rule-based assistant available from every page's title bar (mounted
 * once in Navbar.jsx). Talks to POST /api/chatbot/message. Any action the
 * bot proposes (see chatbot.service.js on the backend) is only executed
 * after the user explicitly confirms it here.
 *
 * Lives in the Navbar as a dropdown — the same pattern as the currency
 * and profile menus right next to it — rather than a floating
 * bottom-right button. That floating button used to sit on top of page
 * content (most visibly, it covered the POS checkout button on short
 * screens); anchored in the title bar, it's always in the same fixed
 * spot and never overlaps anything below it.
 */
export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const scrollRef = useRef(null)
  const wrapperRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isOpen])

  // Close on outside click, same as the currency/profile dropdowns.
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isSending) return

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setIsSending(true)

    try {
      const res = await chatbotService.sendMessage(text, pendingAction)
      const { reply, pendingAction: nextPendingAction, navigate: navigateTo } = res.data.data
      setMessages((prev) => [...prev, { role: 'bot', text: reply }])
      setPendingAction(nextPendingAction || null)
      if (navigateTo) navigate(navigateTo)
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: err.response?.data?.message || 'Sorry, something went wrong on my end.' },
      ])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
          isOpen ? 'bg-amber-light text-amber-dark' : 'text-ink-muted hover:bg-paper-dim hover:text-ink'
        }`}
        aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
      >
        <Icon
          name="chat"
          className="h-[18px] w-[18px] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
        />
        <span className="hidden sm:inline">Assistant</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[340px] max-w-[calc(100vw-2rem)] h-[440px] card chat-panel-glow flex flex-col overflow-hidden z-30">
          <div className="px-4 py-3 border-b border-line bg-gradient-to-r from-ink to-ink-light text-paper flex items-center gap-2.5 shrink-0">
            <span className="section-icon bg-amber/20 text-amber">
              <Icon name="chat" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <span className="font-display text-sm font-semibold block leading-tight">Store Assistant</span>
              <span className="flex items-center gap-1.5 text-[11px] text-paper/60 leading-tight mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-teal pulse-dot-teal" />
                Ready to help
              </span>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-2.5">
            {messages.map((m, i) => (
              <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'bot' && (
                  <span className="h-6 w-6 rounded-full bg-amber-light text-amber-dark flex items-center justify-center shrink-0">
                    <Icon name="chat" className="h-3.5 w-3.5" />
                  </span>
                )}
                <div
                  className={`max-w-[78%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${
                    m.role === 'user' ? 'bg-amber text-ink' : 'bg-paper-dim text-ink'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex items-end gap-2 justify-start">
                <span className="h-6 w-6 rounded-full bg-amber-light text-amber-dark flex items-center justify-center shrink-0">
                  <Icon name="chat" className="h-3.5 w-3.5" />
                </span>
                <div className="bg-paper-dim rounded-lg px-3 py-2.5 flex items-center gap-1" aria-label="Assistant is typing">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-muted typing-dot" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-muted typing-dot" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-muted typing-dot" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="p-3 border-t border-line flex gap-2 shrink-0">
            <input
              className="input-field flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={pendingAction?.mode === 'confirm' ? 'Reply "yes" to confirm…' : 'Ask something…'}
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="btn-accent px-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-6px_rgba(232,163,61,0.55)] disabled:hover:translate-y-0 disabled:hover:shadow-none"
              aria-label="Send"
            >
              <Icon name="send" className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
