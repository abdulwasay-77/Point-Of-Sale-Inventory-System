
import { useState, useEffect } from 'react'

// Debounces a fast-changing value (e.g. a search input) so we don't
// re-filter/re-query on every keystroke.
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
