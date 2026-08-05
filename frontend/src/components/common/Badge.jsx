
/**
 * Small status badge. `tone` maps to the badge-* utility classes
 * defined in index.css (teal = healthy, rose = warning/low, amber = neutral flag).
 */
export default function Badge({ tone = 'teal', children }) {
  const toneClass = {
    teal: 'badge-teal',
    rose: 'badge-rose',
    amber: 'badge-amber',
  }[tone]

  return <span className={toneClass}>{children}</span>
}
