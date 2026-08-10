import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Letter shortcuts are deliberately modifier-based. Plain letters must always
// remain available for names, SKUs, notes, search, and every other form field.
// A shortcut only follows a route when its corresponding sidebar link is
// actually present, so hidden permission/module-restricted pages cannot be
// opened through the keyboard.
const NAVIGATION_SHORTCUTS = {
  d: '/',
  h: '/',
  p: '/pos',
  o: '/products',
  i: '/inventory',
  c: '/customers',
  u: '/suppliers',
  s: '/sales',
  r: '/reports',
  e: '/expenses',
  w: '/warehouses',
  k: '/kits',
  b: '/barcodes',
  g: '/categories',
  v: '/variations',
  m: '/units',
  l: '/payroll',
  t: '/settings',
  y: '/profile',
}

const CONTROL_SELECTOR = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"]:not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"])'

function isEditingControl(element) {
  return Boolean(element?.matches?.('input, textarea, select, [contenteditable="true"]'))
}

function isVisibleControl(element) {
  const rect = element.getBoundingClientRect()
  const style = globalThis.getComputedStyle(element)
  // Controls outside a scroll container's current viewport must remain
  // eligible: Arrow navigation will scroll them into view after focusing.
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && !element.closest('[aria-hidden="true"]')
}

function findDirectionalControl(controls, current, direction) {
  const currentRect = current.getBoundingClientRect()
  const currentX = currentRect.left + currentRect.width / 2
  const currentY = currentRect.top + currentRect.height / 2
  const horizontal = direction === 'left' || direction === 'right'

  const candidates = controls
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
      return {
        control,
        primary: Math.abs(horizontal ? dx : dy),
        secondary: Math.abs(horizontal ? dy : dx),
        x: rect.left + rect.width / 2,
        matchesDirection,
      }
    })
    .filter((candidate) => candidate.matchesDirection)

  if (horizontal) {
    // Never let Left/Right leave its current visual row.
    return candidates
      .filter((candidate) => candidate.secondary <= 40)
      .sort((a, b) => a.primary - b.primary)[0]?.control
  }

  // Up/Down first find the nearest form/card row, then choose the closest
  // column on that row. A tie intentionally picks the leftmost field so a
  // full-width field moves Down to the beginning of the next row.
  const nearestRowDistance = Math.min(...candidates.map((candidate) => candidate.primary))
  return candidates
    .filter((candidate) => candidate.primary <= nearestRowDistance + 40)
    .sort((a, b) => a.secondary - b.secondary || a.x - b.x)[0]?.control
}

export function useGlobalKeyboardNavigation() {
  const [keyboardMode, setKeyboardMode] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    globalThis.document.documentElement.dataset.keyboardMode = String(keyboardMode)
    return () => {
      delete globalThis.document.documentElement.dataset.keyboardMode
    }
  }, [keyboardMode])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.defaultPrevented) return

      const target = event.target
      const isEditing = isEditingControl(target)

      if (event.key === 'F1') {
        event.preventDefault()
        setKeyboardMode((enabled) => !enabled)
        return
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey && !globalThis.document.querySelector('[role="dialog"][aria-modal="true"]')) {
        const route = NAVIGATION_SHORTCUTS[event.key.toLowerCase()]
        // The sidebar omits links the user is not allowed to open. Check
        // that permission-aware source, but use the router directly so the
        // shortcut works even when the sidebar link is off-screen/collapsed.
        const link = route && globalThis.document.querySelector(`a[href="${route}"]`)
        if (link) {
          event.preventDefault()
          navigate(route)
          return
        }
      }

      // '/' is a conventional search shortcut. It is ignored while typing
      // so a slash can still be entered in any editable field.
      if (event.key === '/' && !isEditing) {
        const search = globalThis.document.querySelector('input[aria-label="Search products, SKU…"]')
        if (search && isVisibleControl(search)) {
          event.preventDefault()
          search.focus()
          search.select()
          return
        }
      }

      if (globalThis.document.querySelector('[role="dialog"][aria-modal="true"]')) return
      if (event.ctrlKey || event.altKey || event.metaKey) return

      const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
      const direction = directions[event.key]
      const shouldAdvanceField = keyboardMode && event.key === 'Enter' && isEditing
      if (!direction && !shouldAdvanceField) return
      if (!keyboardMode && isEditing) return

      // POS product cards use their own result-aware navigation. The
      // current POS page also handles its specialized controls directly.
      if (target?.closest?.('[data-pos-product-panel]')) return
      if (!keyboardMode && target?.closest?.('[data-pos-navigation-root]')) return

      const current = target?.closest?.(CONTROL_SELECTOR)
      if (!current) return
      const scope = current.closest('[data-keyboard-scope]') || globalThis.document
      const controls = Array.from(scope.querySelectorAll(CONTROL_SELECTOR)).filter(isVisibleControl)
      const next = shouldAdvanceField
        ? findDirectionalControl(controls, current, 'down') || controls[controls.indexOf(current) + 1]
        : findDirectionalControl(controls, current, direction)
      if (!next) return

      event.preventDefault()
      next.focus({ preventScroll: true })
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }

    globalThis.document.addEventListener('keydown', handleKeyDown)
    return () => globalThis.document.removeEventListener('keydown', handleKeyDown)
  }, [keyboardMode, navigate])

  return keyboardMode
}
