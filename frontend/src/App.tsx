import { useMemo, useState } from 'react'
import {
  Activity,
  LayoutDashboard,
  ListFilter,
  Moon,
  RefreshCcw,
  Sun,
  Waves,
} from 'lucide-react'
import { useTheme } from './hooks/useTheme'
import { Button } from './components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/Card'
import { Toggle } from './components/ui/Toggle'
import { useMetrics } from './hooks/useMetrics'
import MetricsDashboard from './components/MetricsDashboard'
import RateTester from './components/RateTester'
import PolicyViewer from './components/PolicyViewer'
import BurstSimulator from './components/BurstSimulator'
import { pickMetricByLabels } from './lib/utils'

type TabId = 'dashboard' | 'tester' | 'policies' | 'simulate'

function formatMetric(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const { theme, setTheme } = useTheme()
  const { metrics, loading, error, lastUpdated, refresh } = useMetrics()

  const totalRequests = useMemo(() => metrics['ratelimit_requests_total'] ?? 0, [metrics])
  const deniedRequests = useMemo(
    () => pickMetricByLabels(metrics, 'ratelimit_requests_total', ['result="denied"']),
    [metrics],
  )
  const activeKeys = useMemo(() => metrics['ratelimit_active_keys'] ?? 0, [metrics])
  const redisLatencySamples = useMemo(() => metrics['ratelimit_redis_duration_seconds_count'] ?? 0, [metrics])
  const circuitStateValue = useMemo(() => metrics['ratelimit_circuit_breaker_state'] ?? 0, [metrics])

  const circuitStateLabel =
    circuitStateValue >= 1.5 ? 'Half Open' : circuitStateValue >= 0.5 ? 'Open' : 'Closed'

  const circuitStateTone =
    circuitStateLabel === 'Closed'
      ? 'border-success/40 bg-success/10 text-success'
      : circuitStateLabel === 'Half Open'
        ? 'border-warn/40 bg-warn/10 text-warn'
        : 'border-deny/40 bg-deny/10 text-deny'

  const tabs: Array<{ id: TabId; title: string; icon: typeof LayoutDashboard }> = [
    { id: 'dashboard', title: 'Overview', icon: LayoutDashboard },
    { id: 'tester', title: 'Rate Tester', icon: Activity },
    { id: 'policies', title: 'Policies', icon: ListFilter },
    { id: 'simulate', title: 'Simulation', icon: Waves },
  ]

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-12%] top-[-8%] h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(13,148,136,0.28),transparent_70%)]" />
        <div className="absolute right-[-8%] top-[5%] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,146,60,0.24),transparent_70%)]" />
        <div className="absolute bottom-[-18%] left-[20%] h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.2),transparent_70%)]" />
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="glass-card animate-rise p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="chip border-border/80 bg-background/70 text-muted-foreground">Production Control Plane</p>
              <h1 className="text-balance text-3xl font-display font-extrabold leading-tight sm:text-4xl">
                <span className="text-gradient">Rate Limiter</span> Command Center
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Monitor live enforcement, validate tenant policy behavior, and pressure-test limits before rollout.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void refresh()
                }}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCcw className="h-4 w-4" />
                {loading ? 'Refreshing...' : 'Refresh Metrics'}
              </Button>

              <Toggle
                variant="outline"
                size="sm"
                pressed={theme === 'dark'}
                onPressedChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label="Toggle theme"
                className="gap-2"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === 'dark' ? 'Light' : 'Dark'}
              </Toggle>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'outline'}
                  className="gap-2"
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon className="h-4 w-4" />
                  {tab.title}
                </Button>
              )
            })}
          </div>
        </header>

        <section className="mt-6 space-y-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-rise">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Total Requests</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-display font-bold">{formatMetric(totalRequests)}</p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Denied Requests</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-display font-bold text-deny">{formatMetric(deniedRequests)}</p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Active Keys</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-display font-bold">{formatMetric(activeKeys)}</p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Circuit Breaker</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <span className={`chip ${circuitStateTone}`}>{circuitStateLabel}</span>
                    <p className="text-xs text-muted-foreground">
                      Redis latency samples captured: {formatMetric(redisLatencySamples)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Telemetry Status</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3 text-sm">
                  <span
                    className={`chip ${
                      error ? 'border-deny/40 bg-deny/10 text-deny' : 'border-success/40 bg-success/10 text-success'
                    }`}
                  >
                    {error ? 'Metrics Degraded' : 'Metrics Healthy'}
                  </span>
                  <span className="text-muted-foreground">
                    Last update:{' '}
                    <span className="font-semibold text-foreground">
                      {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'pending'}
                    </span>
                  </span>
                  {error && <span className="text-deny">Error: {error}</span>}
                </CardContent>
              </Card>

              <MetricsDashboard metrics={metrics} />
            </div>
          )}

          {activeTab === 'tester' && <RateTester />}

          {activeTab === 'policies' && <PolicyViewer />}

          {activeTab === 'simulate' && <BurstSimulator />}
        </section>
      </main>
    </div>
  )
}
