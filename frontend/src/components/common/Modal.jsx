import { useEffect, useRef, useState } from 'react'
import { onApiError } from '../../utils/errorBus'

/**
 * Reusable Modal used for all create/edit forms across the app
 * (products, categories, customers, suppliers, purchases).
 *
 * Premium pass: blurred backdrop with a fade-in, the panel itself pops
 * in with a soft scale/translate (`.modal-panel`), a slim amber gradient
 * bar runs across the top edge, and the close button gets a rose glow
 * + spin on hover instead of a flat "×".
 *
 * Error pulse: the actual error message now lives in one place —
 * GlobalErrorModal, mounted at the app root, which pops up on top of
 * this Modal automatically whenever a request fails (see
 * axiosInstance.js's response interceptor and errorBus.js). This Modal
 * still gets a quiet, wordless signal of its own — a brief red ring
 * pulse on its panel — purely so it's visually obvious *which* open
 * form the error belongs to, without repeating the message twice or
 * needing every individual page to wire this up itself.
 */
export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const [isPulsing, setIsPulsing] = useState(false)
  const pulseTimeoutRef = useRef(null)

  // Close on Escape key for keyboard accessibility.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Quiet red pulse when a backend error fires while this Modal is open
  // — see the file comment above for why this exists alongside (not
  // instead of) GlobalErrorModal.
  useEffect(() => {
    if (!isOpen) return undefined
    const unsubscribe = onApiError(() => {
      setIsPulsing(true)
      window.clearTimeout(pulseTimeoutRef.current)
      pulseTimeoutRef.current = window.setTimeout(() => setIsPulsing(false), 700)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(pulseTimeoutRef.current)
    }
  }, [isOpen])

  if (!isOpen) return null

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  }[size]

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`modal-panel relative bg-white dark:bg-dark-card w-full ${sizeClass} max-h-[90vh] overflow-y-auto rounded-2xl border border-line dark:border-dark-border shadow-[0_24px_70px_-18px_rgba(31,36,48,0.45)] dark:shadow-[0_24px_70px_-18px_rgba(0,0,0,0.7)] ${
          isPulsing ? 'modal-panel-shake ring-2 ring-rose dark:ring-dark-rose' : ''
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-amber via-amber-dark to-amber" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-dark-border">
          <h2 className="font-display text-base font-semibold text-ink dark:text-dark-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full text-ink-muted dark:text-dark-muted text-xl leading-none transition-all duration-200 hover:text-white hover:bg-rose dark:hover:bg-dark-rose hover:rotate-90 hover:shadow-[0_0_14px_2px_rgba(193,80,46,0.4)]"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
