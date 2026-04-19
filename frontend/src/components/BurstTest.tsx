import { useCallback, useMemo, useState, useRef } from 'react'
import { 
  Zap, 
  Play, 
  Square, 
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  Activity,
  Target
} from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select, type SelectOption } from './ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import type { BurstResult, BurstTestRequest } from '../types'
import { digitsOnly, parseOptionalPositiveInt } from '../lib/formUtils'

const DEFAULT_COUNT = 20

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'DELETE']

const METHOD_SELECT_OPTIONS: SelectOption[] = METHOD_OPTIONS.map((method) => ({
  value: method,
  label: method,
}))
const ROUTE_PRESETS = [
  { route: '/v1/login', method: 'POST', description: 'Login endpoint (limited to 10/min)' },
  { route: '/v1/search', method: 'GET', description: 'Search endpoint (higher limit)' },
  { route: '/v1/data', method: 'POST', description: 'Data submission' },
]

export default function BurstTest() {
  const [form, setForm] = useState<Omit<BurstTestRequest, 'count'>>({
    tenant_id: 'acme',
    route: '/v1/login',
    method: 'POST',
  })
  /** Empty = use default ({@link DEFAULT_COUNT}); lets users clear and re-type. */
  const [countInput, setCountInput] = useState('')
  const effectiveCount = useMemo(
    () => parseOptionalPositiveInt(countInput, DEFAULT_COUNT, 1, 100),
    [countInput],
  )
  const [result, setResult] = useState<BurstResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef(false)

  const handleRunBurst = useCallback(async () => {
    setLoading(true)
    setIsRunning(true)
    setResult(null)
    setProgress(0)
    abortRef.current = false

    const totalRequests = effectiveCount
    const stats = {
      total: totalRequests,
      allowed: 0,
      denied: 0,
      other: 0,
    }

    try {
      for (let i = 0; i < totalRequests; i++) {
        if (abortRef.current) break

        try {
          const response = await fetch(`/api${form.route.startsWith('/') ? '' : '/'}${form.route}`, {
            method: form.method,
            headers: {
              'X-Tenant-ID': form.tenant_id,
              'Content-Type': 'application/json',
            },
          })

          if (response.status === 200) {
            stats.allowed++
          } else if (response.status === 429) {
            stats.denied++
          } else {
            stats.other++
          }
        } catch {
          stats.other++
        }

        setProgress(((i + 1) / totalRequests) * 100)
        setResult({
          ...stats,
          allowedPercentage: (stats.allowed / (i + 1)) * 100,
          deniedPercentage: (stats.denied / (i + 1)) * 100,
          otherPercentage: (stats.other / (i + 1)) * 100,
        })

        // Small delay to avoid overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    } finally {
      setLoading(false)
      setIsRunning(false)
    }
  }, [form, effectiveCount])

  const handleStop = useCallback(() => {
    abortRef.current = true
    setIsRunning(false)
  }, [])

  const handlePresetSelect = useCallback((preset: typeof ROUTE_PRESETS[0]) => {
    setForm(prev => ({
      ...prev,
      route: preset.route,
      method: preset.method,
    }))
  }, [])

  const getHealthColor = (percentage: number) => {
    if (percentage >= 80) return 'text-success'
    if (percentage >= 50) return 'text-warn'
    return 'text-deny'
  }

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card className="glass-card animate-rise">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Zap className="h-5 w-5 text-primary" />
            Traffic Burst Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Run a real burst test by sending multiple concurrent requests. This will test 
            the rate limiter under high-traffic conditions and show actual allow/deny behavior.
          </p>

          {/* Route Presets */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Quick Routes</label>
            <div className="flex flex-wrap gap-2">
              {ROUTE_PRESETS.map((preset) => (
                <button
                  key={`${preset.route}-${preset.method}`}
                  onClick={() => handlePresetSelect(preset)}
                  className="chip cursor-pointer border-border bg-background/70 text-muted-foreground transition-all hover:border-primary hover:bg-primary/10 hover:text-primary"
                >
                  <span className="bg-primary/10 text-primary text-xs">{preset.method}</span>
                  {preset.route}
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
              <label className="text-sm font-medium">Method</label>
              <Select
                value={form.method}
                onValueChange={(method) => setForm({ ...form, method })}
                options={METHOD_SELECT_OPTIONS}
                placeholder="HTTP method"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Route</label>
              <Input
                value={form.route}
                onChange={(event) => setForm({ ...form, route: event.target.value })}
                placeholder="/v1/login"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="burst-count">
                Request count
              </label>
              <div className="relative">
                <Input
                  id="burst-count"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={countInput}
                  onChange={(event) => setCountInput(digitsOnly(event.target.value))}
                  placeholder={String(DEFAULT_COUNT)}
                  className="pr-10 font-mono tabular-nums"
                  aria-describedby="burst-count-hint"
                />
                <Target className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p id="burst-count-hint" className="text-xs text-muted-foreground">
                Empty uses default {DEFAULT_COUNT} (max 100)
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {!isRunning ? (
              <Button 
                className="flex-1 gap-2" 
                onClick={handleRunBurst} 
                disabled={loading}
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Start Burst Test
                  </>
                )}
              </Button>
            ) : (
              <Button 
                variant="destructive"
                className="flex-1 gap-2" 
                onClick={handleStop} 
                size="lg"
              >
                <Square className="h-4 w-4" />
                Stop Test
              </Button>
            )}
          </div>

          {/* Progress Bar */}
          {loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium text-foreground">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div 
                  className="h-2 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Card */}
      <Card className="glass-card animate-rise" style={{ animationDelay: '50ms' }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Activity className="h-5 w-5 text-primary" />
            Burst Test Results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!result ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                Run a burst test to see real-time results.
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Click "Start Burst Test" to begin sending requests
              </p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className={`rounded-xl border border-success/30 bg-success/10 p-4 text-center ${getHealthColor(result.allowedPercentage)}`}>
                  <CheckCircle className="mx-auto h-6 w-6" />
                  <p className="mt-1 text-2xl font-bold">{result.allowed}</p>
                  <p className="text-xs text-muted-foreground">Allowed (200)</p>
                  <p className="mt-1 text-xs font-medium">{result.allowedPercentage.toFixed(1)}%</p>
                </div>

                <div className={`rounded-xl border border-deny/30 bg-deny/10 p-4 text-center ${getHealthColor(result.allowedPercentage)}`}>
                  <XCircle className="mx-auto h-6 w-6" />
                  <p className="mt-1 text-2xl font-bold">{result.denied}</p>
                  <p className="text-xs text-muted-foreground">Denied (429)</p>
                  <p className="mt-1 text-xs font-medium">{result.deniedPercentage.toFixed(1)}%</p>
                </div>

                <div className={`rounded-xl border border-border/30 bg-muted/30 p-4 text-center`}>
                  <AlertCircle className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-1 text-2xl font-bold">{result.other}</p>
                  <p className="text-xs text-muted-foreground">Other Errors</p>
                  <p className="mt-1 text-xs font-medium">{result.otherPercentage.toFixed(1)}%</p>
                </div>
              </div>

              {/* Overall Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className={`font-bold ${getHealthColor(result.allowedPercentage)}`}>
                    {result.allowedPercentage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-3 rounded-full bg-gradient-to-r from-success via-warn to-deny transition-all"
                    style={{ width: `${result.allowedPercentage}%` }}
                  />
                </div>
              </div>

              {/* Total Summary */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Requests Sent</span>
                  <span className="text-xl font-bold text-foreground">{result.total}</span>
                </div>
              </div>

              {/* Information */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium text-primary">How to Interpret Results</p>
                <ul className="mt-3 space-y-2.5 text-xs text-muted-foreground">
                  <li className="flex gap-2.5">
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                    <span>
                      <strong className="text-foreground">200 (Allowed):</strong> Request passed rate limiting
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-deny" aria-hidden />
                    <span>
                      <strong className="text-foreground">429 (Denied):</strong> Request was rate limited
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span>
                      <strong className="text-foreground">Other:</strong> Network errors or non-rate-limit responses
                    </span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
