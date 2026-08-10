import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
 *
 * Rendered via a React portal into document.body rather than in-place
 * in the component tree. `position: fixed` only positions relative to
 * the *viewport* if every ancestor has a plain (non-transformed)
 * containing block — but several premium-UI ancestors (e.g. POS's
 * `.card-premium`, which applies `transform: translateY(-4px)` on
 * hover) create a new containing block the instant they're hovered.
 * Without the portal, opening this Modal from inside one of those while
 * the cursor is still sitting over it (the normal case right after a
 * click) silently confines the "fixed" backdrop to that ancestor's box
 * instead of the real viewport — cramped, offset, wrong. The portal
 * sidesteps this entirely by mounting outside any such ancestor, so this
 * Modal always covers the full screen regardless of where it's opened
 * from.
 */
export default function Modal({ isOpen, onClose, title, children, size = 'md', keyboardNavigation = false, initialFocusSelector }) {
  const [isPulsing, setIsPulsing] = useState(false)
  const pulseTimeoutRef = useRef(null)
  const panelRef = useRef(null)

  // Close on Escape key for keyboard accessibility.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // POS opts into this behavior for its transaction dialogs. It keeps focus
  // inside the active dialog, while standard radio/select/range controls
  // retain their browser Arrow-key behavior.
  useEffect(() => {
    if (!isOpen || !keyboardNavigation) return undefined

    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusInitialControl = () => {
      const panel = panelRef.current
      if (!panel) return
      const initial = initialFocusSelector ? panel.querySelector(initialFocusSelector) : null
      const first = panel.querySelector(focusableSelector)
      ;(initial || first)?.focus()
    }
    const frameId = globalThis.requestAnimationFrame(focusInitialControl)

    function trapTab(event) {
      const controls = Array.from(panelRef.current?.querySelectorAll(focusableSelector) || [])
      if (controls.length === 0) return
      const target = event.target

      const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
      const direction = directions[event.key]
      if (direction && !target?.matches?.('input, textarea, select, [contenteditable="true"]')) {
        const current = target?.closest?.(focusableSelector)
        if (!current) return
        const currentRect = current.getBoundingClientRect()
        const currentX = currentRect.left + currentRect.width / 2
        const currentY = currentRect.top + currentRect.height / 2
        const horizontal = direction === 'left' || direction === 'right'
        const next = controls
          .filter((control) => control !== current)
          .map((control) => {
            const rect = control.getBoundingClientRect()
            const dx = rect.left + rect.width / 2 - currentX
            const dy = rect.top + rect.height / 2 - currentY
            const matchesDirection =
              (direction === 'left' && dx < -1) ||
              (direction === 'right' && dx > 1) ||
              (direction === 'up' && dy < -1) ||
              (direction === 'down' && dy > 1)
            return { control, primary: Math.abs(horizontal ? dx : dy), secondary: Math.abs(horizontal ? dy : dx), matchesDirection }
          })
          .filter((candidate) => candidate.matchesDirection)
          .sort((a, b) => a.primary - b.primary || a.secondary - b.secondary)[0]?.control

        if (next) {
          event.preventDefault()
          next.focus({ preventScroll: true })
          next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
        return
      }

      if (event.key !== 'Tab') return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && globalThis.document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && globalThis.document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    globalThis.document.addEventListener('keydown', trapTab)
    return () => {
      globalThis.cancelAnimationFrame(frameId)
      globalThis.document.removeEventListener('keydown', trapTab)
    }
  }, [initialFocusSelector, isOpen, keyboardNavigation])

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

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={panelRef}
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
    </div>,
    document.body,
  )
}
