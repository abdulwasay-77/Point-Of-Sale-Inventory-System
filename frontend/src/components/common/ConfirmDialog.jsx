import Modal from './Modal'

/**
 * Confirmation dialog used before destructive actions (mainly deletes).
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  isDanger = true,
  keyboardNavigation = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm" keyboardNavigation={keyboardNavigation} initialFocusSelector="[data-confirm-cancel]">
      <p className="text-sm text-ink-muted dark:text-dark-muted">{message}</p>
      <div className="flex justify-end gap-3 mt-6">
        <button type="button" data-confirm-cancel className="btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={isDanger ? 'btn-danger' : 'btn-accent'}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
