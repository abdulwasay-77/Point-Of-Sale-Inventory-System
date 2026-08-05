import { useEffect, useState } from 'react'
import Icon from './Icon'
import { onApiError } from '../../utils/errorBus'

/**
 * Mounted exactly once, at the very root of the app (see main.jsx) —
 * outside and above every route, every page, and every page's own
 * create/edit Modal. Every failed API call anywhere in the app surfaces
 * here automatically via errorBus.js's onApiError subscription, wired
 * up in axiosInstance.js's response interceptor. No individual page
 * needs to catch-and-display this itself anymore.
 *
 * Two deliberate exceptions: Login and POS checkout pass
 * `skipGlobalError: true` on those specific requests (see
 * authService.js / salesService.js) and keep their own inline error
 * text instead — both are tight, single-purpose flows where an error
 * reads better staying exactly where the action happened rather than
 * interrupting with a popup.
 *
 * z-[200] is deliberately higher than the shared Modal component's
 * z-50 — if a category/product/etc. form Modal is open when this
 * fires, this popup renders on top of it, not trapped behind or inside
 * it. That underlying Modal also gets a brief red pulse of its own
 * (see Modal.jsx) so it's visually clear which form the error belongs
 * to, without duplicating the actual message in two places.
 */
export default function GlobalErrorModal() {
  const [message, setMessage] = useState(null)

  useEffect(() => onApiError(setMessage), [])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') setMessage(null)
    }
    if (message) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [message])

  if (!message) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Something went wrong"
      onClick={() => setMessage(null)}
    >
      <div
        className="modal-panel relative bg-white dark:bg-dark-card w-full max-w-sm rounded-2xl border border-line dark:border-dark-border shadow-[0_24px_70px_-18px_rgba(31,36,48,0.45)] dark:shadow-[0_24px_70px_-18px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-rose to-[#9c3f22]" />
        <div className="p-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-rose-light dark:bg-dark-rose/15 flex items-center justify-center mb-4">
            <Icon name="close" className="h-6 w-6 text-rose dark:text-dark-rose" />
          </div>
          <h2 className="font-display text-base font-semibold text-ink dark:text-dark-text mb-1.5">Something went wrong</h2>
          <p className="text-sm text-ink-muted dark:text-dark-muted leading-relaxed">{message}</p>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="btn-accent w-full mt-5 transition-all duration-200 hover:-translate-y-0.5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
