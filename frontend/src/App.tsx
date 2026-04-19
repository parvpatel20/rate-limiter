import { useMemo, useState } from 'react'
import {
  Activity,
  LayoutDashboard,
  ListFilter,
  Moon,
  RefreshCcw,
  Sun,
  Waves,
  Heart,
  Zap,
  Settings,
  Cpu,
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
import HealthCheck from './components/HealthCheck'
import BurstTest from './components/BurstTest'
import AdminPanel from './components/AdminPanel'
import { pickMetricByLabels } from './lib/utils'

type TabId = 'dashboard' | 'tester' | 'policies' | 'simulate' | 'health' | 'burst' | 'admin'

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
  const allowedRequests = useMemo(
    () => pickMetricByLabels(metrics, 'ratelimit_requests_total', ['result="allowed"']),
    [metrics],
  )
  const activeKeys = useMemo(() => metrics['ratelimit_active_keys'] ?? 0, [metrics])
  const redisLatencySamples = useMemo(() => metrics['ratelimit_redis_duration_seconds_count'] ?? 0, [metrics])
  const circuitStateValue = useMemo(() => metrics['ratelimit_circuit_breaker_state'] ?? 0, [metrics])
  const fastAllows = useMemo(
    () => pickMetricByLabels(metrics, 'ratelimit_local_decisions_total', ['decision="fast_allow"']),
    [metrics],
  )

  const circuitStateLabel =
    circuitStateValue >= 1.5 ? 'Half Open' : circuitStateValue >= 0.5 ? 'Open' : 'Closed'

  const circuitStateTone =
    circuitStateLabel === 'Closed'
      ? 'border-success/40 bg-success/10 text-success'
      : circuitStateLabel === 'Half Open'
        ? 'border-warn/40 bg-warn/10 text-warn'
        : 'border-deny/40 bg-deny/10 text-deny'

  // Calculate success rate
  const successRate = useMemo(() => {
    if (totalRequests === 0) return 100
    return (allowedRequests / totalRequests) * 100
  }, [totalRequests, allowedRequests])

  const tabs: Array<{ id: TabId; title: string; icon: typeof LayoutDashboard }> = [
    { id: 'dashboard', title: 'Overview', icon: LayoutDashboard },
    { id: 'tester', title: 'Rate Tester', icon: Activity },
    { id: 'policies', title: 'Policies', icon: ListFilter },
    { id: 'simulate', title: 'Simulation', icon: Waves },
    { id: 'health', title: 'Health', icon: Heart },
    { id: 'burst', title: 'Burst Test', icon: Zap },
    { id: 'admin', title: 'Admin', icon: Settings },
  ]

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      {/* Background Gradient Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-[-12%] top-[-8%] h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(13,148,136,0.28),transparent_70%)]" />
        <div className="absolute right-[-8%] top-[5%] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,146,60,0.24),transparent_70%)]" />
        <div className="absolute bottom-[-18%] left-[20%] h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.2),transparent_70%)]" />
      </div>

      <main className="relative z-0 mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-10">
        {/* Header */}
        <header className="glass-card animate-rise min-w-0 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="chip w-fit border-border/80 bg-background/70 text-muted-foreground">
                Production Control Plane
              </p>
              <h1 className="text-balance text-3xl font-display font-extrabold leading-tight sm:text-4xl">
                <span className="text-gradient">Rate Limiter</span> Command Center
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Monitor live enforcement, validate tenant policy behavior, and pressure-test limits
                before rollout.
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
                <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
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

          {/* Tab Navigation */}
          <div className="mt-6 flex min-w-0 flex-wrap gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
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
                  <span className="hidden sm:inline">{tab.title}</span>
                </Button>
              )
            })}
          </div>
        </header>

        {/* Main Content */}
        <section className="mt-6 min-w-0 space-y-6 pb-4">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-rise">
              {/* KPI Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Total Requests</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-display font-bold">{formatMetric(totalRequests)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {successRate.toFixed(1)}% success rate
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Denied Requests</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-display font-bold text-deny">{formatMetric(deniedRequests)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {totalRequests > 0 ? ((deniedRequests / totalRequests) * 100).toFixed(1) : 0}% denial rate
                    </p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Active Keys</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-display font-bold">{formatMetric(activeKeys)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Tracked rate limit keys</p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Circuit Breaker</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <span className={`chip ${circuitStateTone}`}>{circuitStateLabel}</span>
                    <p className="text-xs text-muted-foreground">
                      Redis samples: {formatMetric(redisLatencySamples)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Metrics */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-primary" />
                    Performance Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-border/70 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">Fast Allows</p>
                      <p className="text-xl font-bold text-success">{formatMetric(fastAllows)}</p>
                      <p className="text-xs text-muted-foreground">Local decisions</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">Allowed</p>
                      <p className="text-xl font-bold text-success">{formatMetric(allowedRequests)}</p>
                      <p className="text-xs text-muted-foreground">Within limits</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">Errors</p>
                      <p className="text-xl font-bold text-warn">
                        {formatMetric(pickMetricByLabels(metrics, 'ratelimit_requests_total', ['result="error"']))}
                      </p>
                      <p className="text-xs text-muted-foreground">System errors</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card/60 p-3">
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                      <p className="text-xl font-bold text-primary">{successRate.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Overall health</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Telemetry Status */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>System Status</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3 text-sm">
                  <span
                    className={`chip ${
                      error
                        ? 'border-deny/40 bg-deny/10 text-deny'
                        : 'border-success/40 bg-success/10 text-success'
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

          {/* Rate Tester Tab */}
          {activeTab === 'tester' && <RateTester />}

          {/* Policies Tab */}
          {activeTab === 'policies' && <PolicyViewer />}

          {/* Simulation Tab */}
          {activeTab === 'simulate' && <BurstSimulator />}

          {/* Health Check Tab */}
          {activeTab === 'health' && <HealthCheck />}

          {/* Burst Test Tab */}
          {activeTab === 'burst' && <BurstTest />}

          {/* Admin Tab */}
          {activeTab === 'admin' && <AdminPanel />}
        </section>
      </main>

      {/* Footer */}
      <footer className="mx-auto mt-auto w-full max-w-7xl shrink-0 px-4 py-6 sm:px-8">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border/50 py-4 text-center text-xs text-muted-foreground sm:flex-row">
          <p>
            Rate Limiter Command Center v1.0 | Backend:{' '}
            <span className="font-mono">http://localhost:8080</span>
          </p>
          <p>Built with Go, React, and Tailwind CSS</p>
        </div>
      </footer>
    </div>
  )
}
