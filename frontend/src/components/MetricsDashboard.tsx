import { useMemo } from 'react'
import {
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { pickMetricByLabels, formatNumber } from '../lib/utils'

interface MetricsDashboardProps {
  metrics: Record<string, number>
}

export default function MetricsDashboard({ metrics }: MetricsDashboardProps) {
  // Request Outcomes Data
  const requestData = useMemo(() => {
    const allowed = pickMetricByLabels(metrics, 'ratelimit_requests_total', ['result="allowed"'])
    const denied = pickMetricByLabels(metrics, 'ratelimit_requests_total', ['result="denied"'])
    const errors = pickMetricByLabels(metrics, 'ratelimit_requests_total', ['result="error"'])
    return [
      { name: 'Allowed', value: allowed, color: '#0d9488' },
      { name: 'Denied', value: denied, color: '#dc2626' },
      { name: 'Errors', value: errors, color: '#d97706' },
    ]
  }, [metrics])

  // Limiter Decisions Data
  const decisionData = useMemo(() => {
    const fastAllow = pickMetricByLabels(metrics, 'ratelimit_local_decisions_total', ['decision="fast_allow"'])
    const redisNeeded = pickMetricByLabels(metrics, 'ratelimit_local_decisions_total', ['decision="redis_needed"'])
    const fastDeny = pickMetricByLabels(metrics, 'ratelimit_local_decisions_total', ['decision="fast_deny"'])
    return [
      { name: 'Fast Allow', value: fastAllow, color: '#0d9488' },
      { name: 'Redis Needed', value: redisNeeded, color: '#f97316' },
      { name: 'Fast Deny', value: fastDeny, color: '#ef4444' },
    ]
  }, [metrics])

  // Policy Cache Data
  const policyCacheData = useMemo(() => {
    const hits = pickMetricByLabels(metrics, 'ratelimit_policy_cache_hits_total', ['outcome="hit"'])
    const misses = pickMetricByLabels(metrics, 'ratelimit_policy_cache_hits_total', ['outcome="miss"'])
    const fallback = pickMetricByLabels(metrics, 'ratelimit_policy_cache_hits_total', ['outcome="fallback_default"'])
    return [
      { name: 'Cache Hits', value: hits, color: '#0d9488' },
      { name: 'Cache Misses', value: misses, color: '#f97316' },
      { name: 'Fallback Default', value: fallback, color: '#d97706' },
    ]
  }, [metrics])

  // No pieData variable - using direct data

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
          <p className="font-medium text-foreground">{payload[0].name}</p>
          <p className="text-sm text-muted-foreground">
            Count: <span className="font-semibold text-foreground">{formatNumber(payload[0].value)}</span>
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Request Outcomes Chart */}
        <Card className="glass-card animate-rise">
          <CardHeader>
            <CardTitle className="text-base">Request Outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={requestData} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} 
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} 
                  allowDecimals={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={50}>
                  {requestData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Limiter Decisions Chart */}
        <Card className="glass-card animate-rise" style={{ animationDelay: '50ms' }}>
          <CardHeader>
            <CardTitle className="text-base">Limiter Decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={decisionData} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  type="number" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} 
                  allowDecimals={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={90}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={30}>
                  {decisionData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Policy Cache Performance */}
        <Card className="glass-card animate-rise" style={{ animationDelay: '100ms' }}>
          <CardHeader>
            <CardTitle className="text-base">Policy Cache Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                <Pie
                  data={policyCacheData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {policyCacheData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics Grid */}
      <Card className="glass-card animate-rise" style={{ animationDelay: '150ms' }}>
        <CardHeader>
          <CardTitle className="text-base">Detailed Metrics Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            <MetricBox 
              label="Total Allowed" 
              value={requestData[0]?.value ?? 0} 
              color="text-success" 
            />
            <MetricBox 
              label="Total Denied" 
              value={requestData[1]?.value ?? 0} 
              color="text-deny" 
            />
            <MetricBox 
              label="Total Errors" 
              value={requestData[2]?.value ?? 0} 
              color="text-warn" 
            />
            <MetricBox 
              label="Fast Allows" 
              value={decisionData[0]?.value ?? 0} 
              color="text-success" 
            />
            <MetricBox 
              label="Redis Needed" 
              value={decisionData[1]?.value ?? 0} 
              color="text-warn" 
            />
            <MetricBox 
              label="Fast Denies" 
              value={decisionData[2]?.value ?? 0} 
              color="text-deny" 
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-3 text-center transition-all hover:bg-card/80">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{formatNumber(value)}</p>
    </div>
  )
}
