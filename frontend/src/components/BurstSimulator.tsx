import { useCallback, useMemo, useState } from 'react'
import { 
  Activity, 
  Gauge, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  Loader2,
  Target,
  Zap,
  Timer
} from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select, type SelectOption } from './ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import type { SimulateResponse } from '../types'
import { digitsOnly, parseOptionalPositiveInt } from '../lib/formUtils'

type SimulatorForm = {
  tenant_id: string
  user_id: string
  route: string
  method: string
  plan: string
}

const DEFAULT_RPS = 25
const DEFAULT_DURATION = 10

const DEFAULT_FORM: SimulatorForm = {
  tenant_id: 'acme',
  user_id: '',
  route: '/v1/search',
  method: 'GET',
  plan: 'enterprise',
}

const PLAN_SELECT_OPTIONS: SelectOption[] = [
  { value: 'free', label: 'Free Plan' },
  { value: 'enterprise', label: 'Enterprise Plan' },
]

/** Snapshot sent to API / shown in history */
type SimulatorSnapshot = SimulatorForm & {
  requests_per_second: number
  duration_seconds: number
}

// Pre-configured simulation scenarios
const SCENARIOS = [
  { name: 'Light Load', rps: 10, duration: 10, description: 'Normal usage pattern' },
  { name: 'Moderate Load', rps: 50, duration: 10, description: 'Elevated traffic' },
  { name: 'Heavy Load', rps: 100, duration: 10, description: 'High traffic burst' },
  { name: 'Stress Test', rps: 200, duration: 5, description: 'Aggressive testing' },
  { name: 'Login Surge', rps: 20, duration: 5, description: 'Simulated login rush' },
]

export default function BurstSimulator() {
  const [form, setForm] = useState<SimulatorForm>(DEFAULT_FORM)
  /** Empty fields fall back to {@link DEFAULT_RPS} / {@link DEFAULT_DURATION} (placeholder hints). */
  const [rpsInput, setRpsInput] = useState('')
  const [durationInput, setDurationInput] = useState('')
  const resolvedRps = useMemo(
    () => parseOptionalPositiveInt(rpsInput, DEFAULT_RPS, 1, 1000),
    [rpsInput],
  )
  const resolvedDuration = useMemo(
    () => parseOptionalPositiveInt(durationInput, DEFAULT_DURATION, 1, 300),
    [durationInput],
  )
  const [result, setResult] = useState<SimulateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<
    Array<{ form: SimulatorSnapshot; result: SimulateResponse; timestamp: Date }>
  >([])

  const allowed = result?.allowed ?? 0
  const denied = result?.denied ?? 0
  const total = result?.total ?? 0
  const successRate = total > 0 ? (allowed / total) * 100 : 0
  const denialRate = total > 0 ? (denied / total) * 100 : 0

  const handleRunSimulation = useCallback(async () => {
    setLoading(true)
    setError(null)

    const requestBody: SimulatorSnapshot = {
      ...form,
      requests_per_second: resolvedRps,
      duration_seconds: resolvedDuration,
    }

    try {
      const response = await fetch('/api/v1/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      const text = await response.text()
      if (!response.ok) {
        throw new Error(text || `HTTP ${response.status}`)
      }

      const simResult = JSON.parse(text) as SimulateResponse
      setResult(simResult)

      setHistory(prev => [
        {
          form: requestBody,
          result: simResult,
          timestamp: new Date(),
        },
        ...prev.slice(0, 9),
      ])
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : 'Failed to run simulation')
    } finally {
      setLoading(false)
    }
  }, [form, resolvedRps, resolvedDuration])

  const handleScenarioSelect = useCallback((scenario: typeof SCENARIOS[0]) => {
    setRpsInput(String(scenario.rps))
    setDurationInput(String(scenario.duration))
  }, [])

  const handleReset = useCallback(() => {
    setForm(DEFAULT_FORM)
    setRpsInput('')
    setDurationInput('')
    setResult(null)
    setError(null)
  }, [])

  // Calculate projected values
  const projections = useMemo(() => {
    const policy = result?.policy
    if (!policy) return null
    
    const limit = policy.Limit
    const windowSeconds = policy.WindowSeconds
    const policyRate = limit / windowSeconds // requests per second allowed
    const totalSim = resolvedRps * resolvedDuration
    
    return {
      allowedRate: policyRate,
      totalRequests: totalSim,
      projectedAllowed: Math.min(
        totalSim,
        limit * Math.ceil(totalSim / limit)
      ),
      capacityPercentage: (resolvedRps / policyRate) * 100,
    }
  }, [result, resolvedRps, resolvedDuration])

  // Determine health status based on results
  const healthStatus = useMemo(() => {
    if (successRate >= 95) return { label: 'Excellent', color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' }
    if (successRate >= 80) return { label: 'Good', color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' }
    if (successRate >= 50) return { label: 'Warning', color: 'text-warn', bg: 'bg-warn/10', border: 'border-warn/30' }
    return { label: 'Critical', color: 'text-deny', bg: 'bg-deny/10', border: 'border-deny/30' }
  }, [successRate])

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      {/* Configuration Card */}
      <Card className="glass-card animate-rise">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Activity className="h-5 w-5 text-primary" />
            Burst Simulator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Scenarios */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Quick Scenarios</label>
            <div className="flex flex-wrap gap-2">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.name}
                  onClick={() => handleScenarioSelect(scenario)}
                  className="chip cursor-pointer border-border bg-background/70 text-muted-foreground transition-all hover:border-primary hover:bg-primary/10 hover:text-primary"
                >
                  <Zap className="h-3 w-3" />
                  {scenario.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Tenant ID</label>
              <Input
                value={form.tenant_id}
                onChange={(event) => setForm({ ...form, tenant_id: event.target.value })}
                placeholder="acme"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Plan</label>
              <Select
                value={form.plan}
                onValueChange={(plan) => setForm({ ...form, plan })}
                options={PLAN_SELECT_OPTIONS}
                placeholder="Choose plan"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Method</label>
              <Input
                value={form.method}
                onChange={(event) => setForm({ ...form, method: event.target.value.toUpperCase() })}
                placeholder="GET"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">User ID (optional)</label>
              <Input
                value={form.user_id}
                onChange={(event) => setForm({ ...form, user_id: event.target.value })}
                placeholder="user-123"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium">Route</label>
              <Input
                value={form.route}
                onChange={(event) => setForm({ ...form, route: event.target.value })}
                placeholder="/v1/search"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="sim-rps">
                Requests / second
              </label>
              <div className="relative">
                <Input
                  id="sim-rps"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={rpsInput}
                  onChange={(event) => setRpsInput(digitsOnly(event.target.value))}
                  placeholder={String(DEFAULT_RPS)}
                  className="pr-10 font-mono tabular-nums"
                  aria-describedby="sim-rps-hint"
                />
                <Target className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p id="sim-rps-hint" className="text-xs text-muted-foreground">
                Empty uses {DEFAULT_RPS}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="sim-duration">
                Duration (seconds)
              </label>
              <div className="relative">
                <Input
                  id="sim-duration"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={durationInput}
                  onChange={(event) => setDurationInput(digitsOnly(event.target.value))}
                  placeholder={String(DEFAULT_DURATION)}
                  className="pr-10 font-mono tabular-nums"
                  aria-describedby="sim-duration-hint"
                />
                <Timer className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p id="sim-duration-hint" className="text-xs text-muted-foreground">
                Empty uses {DEFAULT_DURATION}
              </p>
            </div>
          </div>

          {/* Total Requests Preview */}
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              Total requests to simulate:{' '}
              <span className="font-bold text-foreground">
                {(resolvedRps * resolvedDuration).toLocaleString()}
              </span>
            </p>
          </div>

          <div className="flex gap-3">
            <Button 
              className="flex-1 gap-2" 
              onClick={handleRunSimulation} 
              disabled={loading}
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running Simulation...
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4" />
                  Run Simulation
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleReset}
              className="gap-2"
            >
              Reset
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-deny/50 bg-deny/10 p-3 text-deny">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Card */}
      <Card className="glass-card animate-rise" style={{ animationDelay: '50ms' }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Gauge className="h-5 w-5 text-primary" />
            Forecast Results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!result ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                Run a simulation to preview allow/deny behavior.
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Adjust parameters on the left and click "Run Simulation"
              </p>
            </div>
          ) : (
            <>
              {/* Policy Info */}
              {result.policy && (
                <div className={`rounded-xl border p-4 ${healthStatus.bg}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Policy in use</p>
                      <p className="text-lg font-bold text-foreground">{result.policy.Name}</p>
                    </div>
                    <span className={`chip ${healthStatus.border} ${healthStatus.bg} ${healthStatus.color} border`}>
                      {healthStatus.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground font-mono">
                    {result.policy.Descriptor}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="chip bg-primary/10 text-primary text-xs">
                      {result.policy.Algorithm === 'sliding_window' ? 'Sliding Window' : 'Token Bucket'}
                    </span>
                    <span className="chip bg-primary/10 text-primary text-xs">
                      {result.policy.Limit} req / {result.policy.WindowSeconds}s
                    </span>
                  </div>
                </div>
              )}

              {/* Main Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border/70 bg-card/80 p-3 text-center">
                  <TrendingUp className="mx-auto h-5 w-5 text-success" />
                  <p className="mt-1 text-xs text-muted-foreground">Allowed</p>
                  <p className="text-xl font-bold text-success">{allowed.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/80 p-3 text-center">
                  <TrendingDown className="mx-auto h-5 w-5 text-deny" />
                  <p className="mt-1 text-xs text-muted-foreground">Denied</p>
                  <p className="text-xl font-bold text-deny">{denied.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/80 p-3 text-center">
                  <Target className="mx-auto h-5 w-5 text-primary" />
                  <p className="mt-1 text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold text-primary">{total.toLocaleString()}</p>
                </div>
              </div>

              {/* Success Rate */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="font-semibold text-foreground">{successRate.toFixed(1)}%</span>
                </div>
                <div className="h-3 rounded-full bg-muted">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-success via-primary to-deny transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, successRate))}%` }}
                  />
                </div>
              </div>

              {/* Denial Rate */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Denial Rate</span>
                  <span className="font-semibold text-foreground">{denialRate.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-deny transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, denialRate))}%` }}
                  />
                </div>
              </div>

              {/* Projections */}
              {projections && (
                <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Projections
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Policy Rate:</span>{' '}
                      <span className="font-medium text-foreground">{projections.allowedRate.toFixed(2)} req/s</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Your Rate:</span>{' '}
                      <span className={`font-medium ${projections.capacityPercentage > 100 ? 'text-deny' : 'text-success'}`}>
                        {projections.capacityPercentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* History Section */}
      {history.length > 0 && (
        <div className="lg:col-span-2">
          <Card className="glass-card animate-rise" style={{ animationDelay: '100ms' }}>
            <CardHeader>
              <CardTitle className="text-base">Simulation History ({history.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Time</th>
                      <th className="pb-2 font-medium">Tenant</th>
                      <th className="pb-2 font-medium">Route</th>
                      <th className="pb-2 font-medium">Rate</th>
                      <th className="pb-2 font-medium">Duration</th>
                      <th className="pb-2 font-medium">Allowed</th>
                      <th className="pb-2 font-medium">Denied</th>
                      <th className="pb-2 font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {history.map((item, idx) => {
                      const sr = item.result.total && item.result.total > 0 
                        ? ((item.result.allowed ?? 0) / item.result.total) * 100 
                        : 0
                      return (
                        <tr key={idx} className="border-b border-border/30">
                          <td className="py-2 text-muted-foreground">{item.timestamp.toLocaleTimeString()}</td>
                          <td className="py-2 font-medium">{item.form.tenant_id}</td>
                          <td className="py-2 font-mono">{item.form.route}</td>
                          <td className="py-2">{item.form.requests_per_second}/s</td>
                          <td className="py-2">{item.form.duration_seconds}s</td>
                          <td className="py-2 text-success">{item.result.allowed}</td>
                          <td className="py-2 text-deny">{item.result.denied}</td>
                          <td className="py-2">
                            <span className={`chip text-xs ${
                              sr >= 90 ? 'bg-success/10 text-success' :
                              sr >= 50 ? 'bg-warn/10 text-warn' :
                              'bg-deny/10 text-deny'
                            }`}>
                              {sr.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
