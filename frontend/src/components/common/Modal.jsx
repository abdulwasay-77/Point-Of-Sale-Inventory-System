
import { useEffect } from 'react'

/**
 * Reusable Modal used for all create/edit forms across the app
 * (products, categories, customers, suppliers, purchases).
 *
 * Premium pass: blurred backdrop with a fade-in, the panel itself pops
 * in with a soft scale/translate (`.modal-panel`), a slim amber gradient
 * bar runs across the top edge, and the close button gets a rose glow
 * + spin on hover instead of a flat "×".
 */
export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  // Close on Escape key for keyboard accessibility.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

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
        className={`modal-panel relative bg-white w-full ${sizeClass} max-h-[90vh] overflow-y-auto rounded-2xl border border-line shadow-[0_24px_70px_-18px_rgba(31,36,48,0.45)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-amber via-amber-dark to-amber" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full text-ink-muted text-xl leading-none transition-all duration-200 hover:text-white hover:bg-rose hover:rotate-90 hover:shadow-[0_0_14px_2px_rgba(193,80,46,0.4)]"
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
