
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="text-center">
        <p className="font-mono text-sm text-amber-dark tracking-widest mb-2">ERROR 404</p>
        <h1 className="font-display text-3xl font-semibold text-ink">Page not found</h1>
        <p className="text-sm text-ink-muted mt-2 max-w-sm mx-auto">
          The page you're looking for doesn't exist or may have moved. Head back to the dashboard
          to keep working.
        </p>
        <Link to="/" className="btn-accent inline-flex mt-6">
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
