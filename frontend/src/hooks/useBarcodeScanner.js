
import { useEffect, useRef } from 'react'

// USB/Bluetooth barcode scanners act as keyboards (HID) — scanning a label
// "types" its digits very fast (a few ms between keystrokes) and finishes
// with Enter. A human typing the same digits takes noticeably longer
// between keystrokes. This hook tells the two apart without needing any
// scanner-specific driver or API: any device that types fast + Enter works
// automatically, including hardware we've never seen.
const MAX_INTERVAL_MS = 40 // max gap between keystrokes to still count as "scanning"
const MIN_LENGTH = 4 // ignore accidental short bursts

export function useBarcodeScanner(onScan, { enabled = true } = {}) {
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)

  useEffect(() => {
    if (!enabled) return undefined

    function handleKeyDown(e) {
      const now = Date.now()
      const gap = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= MIN_LENGTH) {
          onScan(bufferRef.current)
        }
        bufferRef.current = ''
        return
      }

      // Only accumulate single printable characters (letters/digits/dashes
      // — what barcodes are made of), and only while keystrokes are
      // arriving fast enough to plausibly be a scanner, not a person typing.
      if (e.key.length === 1) {
        if (gap > MAX_INTERVAL_MS) {
          bufferRef.current = '' // too slow — this is a human, start fresh
        }
        bufferRef.current += e.key
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onScan])
}
