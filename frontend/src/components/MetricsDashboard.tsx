import {
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { pickMetricByLabels } from '../lib/utils'

interface MetricsDashboardProps {
  metrics: Record<string, number>
}

export default function MetricsDashboard({ metrics }: MetricsDashboardProps) {
  const requestData = [
    {
      name: 'Allowed',
      value: pickMetricByLabels(metrics, 'ratelimit_requests_total', ['result="allowed"']),
      color: '#0f766e',
    },
    {
      name: 'Denied',
      value: pickMetricByLabels(metrics, 'ratelimit_requests_total', ['result="denied"']),
      color: '#dc2626',
    },
    {
      name: 'Errors',
      value: pickMetricByLabels(metrics, 'ratelimit_requests_total', ['result="error"']),
      color: '#d97706',
    },
  ]

  const localDecisionData = [
    {
      name: 'Fast Allow',
      value: pickMetricByLabels(metrics, 'ratelimit_local_decisions_total', ['decision="fast_allow"']),
      color: '#0d9488',
    },
    {
      name: 'Redis Needed',
      value: pickMetricByLabels(metrics, 'ratelimit_local_decisions_total', ['decision="redis_needed"']),
      color: '#f97316',
    },
    {
      name: 'Fast Deny',
      value: pickMetricByLabels(metrics, 'ratelimit_local_decisions_total', ['decision="fast_deny"']),
      color: '#ef4444',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="glass-card animate-rise">
        <CardHeader>
          <CardTitle>Request Outcomes</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={requestData} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--card))',
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {requestData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="glass-card animate-rise">
        <CardHeader>
          <CardTitle>Limiter Decisions</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={localDecisionData} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} allowDecimals={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={100}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--card))',
                }}
              />
              <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                {localDecisionData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
