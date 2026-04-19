import { useCallback, useMemo, useState } from 'react'
import { 
  FlaskConical, 
  ShieldCheck, 
  Clock, 
  CheckCircle, 
  XCircle,
  Loader2,
  Copy,
  ChevronDown,
  AlertCircle
} from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select, type SelectOption } from './ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { DEMO_TENANTS, ROUTE_PRESETS, type BackendPolicy, type CheckApiResponse, type RateCheckRequest, type RateResult } from '../types'

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const PLAN_SELECT_OPTIONS: SelectOption[] = ['free', 'enterprise'].map((plan) => ({
  value: plan,
  label: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
}))

const METHOD_SELECT_OPTIONS: SelectOption[] = METHOD_OPTIONS.map((method) => ({
  value: method,
  label: method,
}))

function normalizeResult(payload: CheckApiResponse): RateResult | null {
  const raw = payload.result
  if (!raw) {
    return null
  }

  return {
    allowed: Boolean(raw.Allowed),
    remaining: Number(raw.Remaining ?? 0),
    limit: Number(raw.Limit ?? 0),
    resetAt: String(raw.ResetAt ?? ''),
    retryAfterSeconds: Number(raw.RetryAfter ?? 0) / 1_000_000_000,
    policyName: payload.policy?.Name,
    policyDescriptor: payload.policy?.Descriptor,
  }
}

function formatResetAt(resetAt: string): string {
  if (!resetAt) return 'n/a'
  const asDate = new Date(resetAt)
  return Number.isNaN(asDate.valueOf()) ? resetAt : asDate.toLocaleString()
}

export default function RateTester() {
  const [form, setForm] = useState<RateCheckRequest>({
    tenant_id: 'acme',
    user_id: '',
    route: '/v1/search',
    method: 'GET',
    plan: 'enterprise',
  })
  const [result, setResult] = useState<RateResult | null>(null)
  const [policy, setPolicy] = useState<BackendPolicy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{ request: RateCheckRequest; result: RateResult; timestamp: Date }>>([])
  const [showPresets, setShowPresets] = useState(false)

  const handleTest = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/v1/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })

      const text = await response.text()
      if (!response.ok) {
        throw new Error(text || `HTTP ${response.status}`)
      }

      const payload = JSON.parse(text) as CheckApiResponse
      const parsed = normalizeResult(payload)
      if (!parsed) {
        throw new Error('Check response did not contain limiter result.')
      }

      setPolicy(payload.policy ?? null)
      setResult(parsed)
      
      // Add to history
      setHistory(prev => [{
        request: { ...form },
        result: parsed,
        timestamp: new Date(),
      }, ...prev.slice(0, 9)]) // Keep last 10
    } catch (err) {
      setPolicy(null)
      setResult(null)
      setError(err instanceof Error ? err.message : 'Failed to run check')
    } finally {
      setLoading(false)
    }
  }, [form])

  const handleCopyRequest = useCallback(() => {
    const curlCommand = `curl -X POST http://localhost:8080/v1/check \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(form, null, 2)}'`
    navigator.clipboard.writeText(curlCommand)
  }, [form])

  const handleSelectTenant = useCallback((tenantId: string) => {
    const tenant = DEMO_TENANTS.find(t => t.id === tenantId)
    setForm(prev => ({
      ...prev,
      tenant_id: tenantId,
      plan: tenant?.plan ?? prev.plan,
    }))
  }, [])

  const handleSelectPreset = useCallback((preset: typeof ROUTE_PRESETS[0]) => {
    setForm(prev => ({
      ...prev,
      route: preset.path,
      method: preset.method,
    }))
    setShowPresets(false)
  }, [])

  const remainingPercentage = useMemo(() => {
    if (!result || result.limit === 0) return 0
    return (result.remaining / result.limit) * 100
  }, [result])

  return (
    <div className="space-y-6">
      {/* Main Test Card */}
      <Card className="glass-card animate-rise">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              <FlaskConical className="h-5 w-5 text-primary" />
              Live Rate Limit Check
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleCopyRequest}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              Copy as cURL
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Quick Tenant Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Quick Tenant Select</label>
            <div className="flex flex-wrap gap-2">
              {DEMO_TENANTS.map(tenant => (
                <button
                  key={tenant.id}
                  onClick={() => handleSelectTenant(tenant.id)}
                  className={`chip cursor-pointer transition-all ${
                    form.tenant_id === tenant.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background/70 text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {tenant.name}
                  <span className="ml-1 text-xs opacity-70">({tenant.plan})</span>
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
              <label className="text-sm font-medium">User ID (optional)</label>
              <Input
                value={form.user_id ?? ''}
                onChange={(event) => setForm({ ...form, user_id: event.target.value })}
                placeholder="user-123"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Plan</label>
              <Select
                value={form.plan ?? 'free'}
                onValueChange={(plan) => setForm({ ...form, plan })}
                options={PLAN_SELECT_OPTIONS}
                placeholder="Choose plan"
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

            <div className="relative space-y-1 sm:col-span-2">
              <label className="text-sm font-medium">Route</label>
              <div className="relative">
                <Input
                  value={form.route}
                  onChange={(event) => setForm({ ...form, route: event.target.value })}
                  placeholder="/v1/search"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPresets(!showPresets)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 gap-1"
                >
                  Presets
                  <ChevronDown className={`h-4 w-4 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
                </Button>
              </div>
              
              {/* Route Presets Dropdown */}
              {showPresets && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card p-2 shadow-lg">
                  {ROUTE_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectPreset(preset)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <div>
                        <span className="chip mr-2 bg-primary/10 text-primary">{preset.method}</span>
                        <span className="font-medium">{preset.path}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{preset.typicalLimit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button 
            onClick={handleTest} 
            disabled={loading} 
            className="w-full gap-2"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing Rate Limit...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Run Rate Limit Check
              </>
            )}
          </Button>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-deny/50 bg-deny/10 p-4 text-deny">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Error</p>
                <p className="text-sm opacity-90">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-5">
              {/* Decision Banner */}
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Decision
                </h4>
                <span
                  className={`chip gap-1.5 px-3 py-1.5 text-sm ${
                    result.allowed 
                      ? 'border-success/50 bg-success/10 text-success' 
                      : 'border-deny/50 bg-deny/10 text-deny'
                  }`}
                >
                  {result.allowed ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {result.allowed ? 'Allowed' : 'Denied'}
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-card/80 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Remaining
                  </div>
                  <p className="mt-1 text-2xl font-bold text-foreground">{result.remaining}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-muted">
                    <div 
                      className={`h-1.5 rounded-full transition-all ${
                        remainingPercentage > 50 ? 'bg-success' : 
                        remainingPercentage > 20 ? 'bg-warn' : 'bg-deny'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, remainingPercentage))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {remainingPercentage.toFixed(1)}% of {result.limit}
                  </p>
                </div>
                
                <div className="rounded-xl border border-border/70 bg-card/80 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Retry After
                  </div>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {result.retryAfterSeconds.toFixed(2)}s
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    If denied
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-card/80 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Limit
                  </div>
                  <p className="mt-1 text-2xl font-bold text-foreground">{result.limit}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    requests/window
                  </p>
                </div>
              </div>

              {/* Reset Time */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Window resets at: <span className="font-medium text-foreground">{formatResetAt(result.resetAt)}</span>
              </div>

              {/* Policy Info */}
              {policy && (
                <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">Matched Policy</p>
                    <p className="text-sm text-primary">{policy.Name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{policy.Descriptor}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="chip bg-primary/10 text-primary text-xs">
                        {policy.Algorithm === 'sliding_window' ? 'Sliding Window' : 'Token Bucket'}
                      </span>
                      <span className="chip bg-primary/10 text-primary text-xs">
                        {policy.Limit} req / {policy.WindowSeconds}s
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Card */}
      {history.length > 0 && (
        <Card className="glass-card animate-rise" style={{ animationDelay: '100ms' }}>
          <CardHeader>
            <CardTitle className="text-base">Recent Checks ({history.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((item, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card/50 p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className={`chip ${item.result.allowed ? 'bg-success/10 text-success' : 'bg-deny/10 text-deny'}`}>
                      {item.result.allowed ? 'ALLOWED' : 'DENIED'}
                    </span>
                    <span className="font-medium">
                      {item.request.method} {item.request.route}
                    </span>
                    <span className="text-muted-foreground">
                      ({item.request.tenant_id})
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
