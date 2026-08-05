import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import Icon from '../common/Icon'
import { formatCurrency } from '../../utils/formatters'
import { dashboardService } from '../../services/dashboardService'
import { useTheme } from '../../hooks/useTheme'

const PERIODS = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
]

/**
 * Premium sales trend card — the first chart in the app, so this leans
 * on the same signature surface everything else uses (receipt-panel
 * texture, glow-amber, shine-sweep) rather than looking like a bolted-on
 * library widget. The gradient fill, grid, and tooltip are all re-themed
 * to the amber "register key" accent instead of Recharts' defaults.
 */
export default function SalesChartCard() {
  const { theme } = useTheme()
  const isDark = theme === 'DARK'
  const [period, setPeriod] = useState('weekly')
  const [data, setData] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    dashboardService
      .getSalesChart(period)
      .then((res) => setData(res.data.data))
      .finally(() => setIsLoading(false))
  }, [period])

  const gridColor = isDark ? '#31353F' : '#E4E0D6'
  const axisColor = isDark ? '#8D92A0' : '#6B7280'
  const lineColor = '#E8A33D'
  const total = data.reduce((sum, d) => sum + d.total, 0)

  return (
    <div className="card card-premium shine-sweep glow-amber p-4 sm:p-5 flex flex-col">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber flex items-center justify-center">
            <Icon name="reports" className="h-4 w-4" />
          </span>
          <h2 className="font-display text-base font-semibold text-ink dark:text-dark-text">Sales overview</h2>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-paper-dim dark:bg-dark-card2 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                period === p.key
                  ? 'bg-amber text-ink shadow-sm'
                  : 'text-ink-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-text'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-ink-muted dark:text-dark-muted mb-3">
        {isLoading ? (
          'Loading…'
        ) : (
          <>
            Total for this period:{' '}
            <span className="figure font-semibold text-ink dark:text-dark-text">{formatCurrency(total)}</span>
          </>
        )}
      </p>

      <div className="h-72 sm:h-80 -ml-2">
        {isLoading ? (
          <div className="h-full w-full flex items-center justify-center">
            <span className="h-8 w-8 rounded-full border-2 border-line dark:border-dark-border border-t-amber animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 5" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 11, fontFamily: 'Inter, sans-serif' }}
                dy={6}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={0}
                tick={false}
                domain={[0, (max) => (max === 0 ? 10 : max * 1.15)]}
              />
              <Tooltip
                cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                content={<ChartTooltip />}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke={lineColor}
                strokeWidth={2.5}
                fill="url(#salesFill)"
                dot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: lineColor, strokeWidth: 2, stroke: isDark ? '#1E222A' : '#fff' }}
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="receipt-panel !shadow-[0_10px_30px_-8px_rgba(232,163,61,0.35)] px-3 py-2 rounded-lg border border-line dark:border-dark-border bg-white dark:bg-dark-card">
      <p className="text-[11px] text-ink-muted dark:text-dark-muted uppercase tracking-wide">{label}</p>
      <p className="figure text-sm font-semibold text-ink dark:text-dark-text mt-0.5">
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  )
}