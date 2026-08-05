
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '../../components/common/PageHeader'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import Icon from '../../components/common/Icon'
import StatCard from '../../components/dashboard/StatCard'
import { reportService } from '../../services/reportService'
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters'
import { REPORT_DEFINITIONS, RANGE_OPTIONS } from './reportDefinitions'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatCell(value, type) {
  if (value === null || value === undefined || value === '') return '—'
  if (type === 'currency') return formatCurrency(value)
  if (type === 'date') return formatDate(value)
  if (type === 'datetime') return formatDateTime(value)
  return value
}

/**
 * One page for every report card on the Generate Reports tab —
 * reportKey from the URL picks which entry of REPORT_DEFINITIONS drives
 * the filters, columns, and summary stats shown. "Generate PDF" hits the
 * exact same backend branch (reports.service.js#generateReportPdf) with
 * the exact same filters currently applied here, so the PDF can never
 * show different numbers than what's on screen.
 */
export default function ReportDetailPage() {
  const { reportKey } = useParams()
  const definition = REPORT_DEFINITIONS[reportKey]

  const [date, setDate] = useState(todayISO())
  const [range, setRange] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState('')

  const filterType = definition?.filterType
  const isCustomRangeIncomplete = filterType === 'range' && range === 'custom' && (!startDate || !endDate)

  function buildFilters() {
    if (filterType === 'date') return { date }
    if (filterType === 'range') {
      return {
        range: range || undefined,
        startDate: range === 'custom' ? startDate : undefined,
        endDate: range === 'custom' ? endDate : undefined,
      }
    }
    return {}
  }

  const load = useCallback(() => {
    if (!definition || isCustomRangeIncomplete) return
    setIsLoading(true)
    setError('')
    definition
      .fetch(reportService, buildFilters())
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load this report.'))
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey, date, range, startDate, endDate])

  useEffect(() => {
    load()
  }, [load])

  async function handleDownloadPdf() {
    setIsDownloading(true)
    setError('')
    try {
      const res = await reportService.downloadReportPdf(reportKey, buildFilters())
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${reportKey}-${Date.now()}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsDownloading(false)
    }
  }

  if (!definition) {
    return (
      <div>
        <PageHeader title="Report not found" subtitle="This report doesn't exist." />
        <Link to="/reports" className="btn-outline">
          ← Back to Reports
        </Link>
      </div>
    )
  }

  const rows = data?.rows || []
  const summary = data ? definition.summary(data) : []

  return (
    <div>
      <PageHeader
        title={definition.label}
        subtitle={definition.description}
        action={
          <div className="flex items-center gap-2">
            <Link
              to="/reports"
              state={{ tab: 'generate' }}
              className="btn-outline transition-all duration-200 hover:-translate-y-0.5"
            >
              ← Back
            </Link>
            <button
              type="button"
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
              disabled={isDownloading || isLoading || rows.length === 0}
              onClick={handleDownloadPdf}
            >
              <Icon name="download" className="h-4 w-4" />
              {isDownloading ? 'Generating…' : 'Generate PDF'}
            </button>
          </div>
        }
      />

      {filterType !== 'none' && (
        <div className="card card-premium p-4 mb-5 flex flex-wrap items-center gap-3">
          {filterType === 'date' && (
            <label className="flex items-center gap-2 text-sm text-ink-muted dark:text-dark-muted">
              Date
              <input
                type="date"
                className="input-field max-w-[180px]"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          )}
          {filterType === 'range' && (
            <>
              <select className="input-field max-w-[180px]" value={range} onChange={(e) => setRange(e.target.value)}>
                {RANGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {range === 'custom' && (
                <>
                  <input
                    type="date"
                    className="input-field max-w-[160px]"
                    value={startDate}
                    max={endDate || todayISO()}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <span className="text-sm text-ink-muted dark:text-dark-muted">to</span>
                  <input
                    type="date"
                    className="input-field max-w-[160px]"
                    value={endDate}
                    min={startDate}
                    max={todayISO()}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {isLoading ? (
        <Loading message={`Loading ${definition.label.toLowerCase()}…`} />
      ) : (
        <>
          {summary.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
              {summary.map((s) => (
                <StatCard
                  key={s.label}
                  label={s.label}
                  value={s.type === 'currency' ? formatCurrency(s.value) : s.value}
                  icon={definition.icon}
                  tone="amber"
                />
              ))}
            </div>
          )}

          <div className="card card-premium glow-amber">
            {rows.length === 0 ? (
              <EmptyState title="No records" description="Nothing matches this filter yet." icon="📄" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base table-premium">
                  <thead>
                    <tr>
                      {definition.columns.map((col) => (
                        <th key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.id || row.invoiceNumber || i} className="group">
                        {definition.columns.map((col) => (
                          <td key={col.key} className={col.align === 'right' ? 'figure text-right' : undefined}>
                            {formatCell(row[col.key], col.type)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}


