
/**
 * Loading indicator. Renders a small ring spinner with an optional message.
 * `fullScreen` centers it in the viewport for page-level loading states.
 */
export default function Loading({ message = 'Loading…', fullScreen = false }) {
  const wrapperClass = fullScreen
    ? 'min-h-[60vh] flex flex-col items-center justify-center'
    : 'flex flex-col items-center justify-center py-12'

  return (
    <div className={wrapperClass} role="status" aria-live="polite">
      <span className="h-8 w-8 rounded-full border-2 border-line border-t-amber animate-spin" />
      <p className="mt-3 text-sm text-ink-muted">{message}</p>
    </div>
  )
}
