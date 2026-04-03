import { useMemo, useState } from 'react'
import { FlaskConical, ShieldCheck } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import type { BackendPolicy, CheckApiResponse, RateCheckRequest, RateResult } from '../types'

const methodOptions = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

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
  }
}

export default function RateTester() {
  const [form, setForm] = useState<RateCheckRequest>({
    tenant_id: 'acme',
    user_id: '',
    route: '/v1/search',
    method: 'GET',
    plan: 'free',
  })
  const [result, setResult] = useState<RateResult | null>(null)
  const [policy, setPolicy] = useState<BackendPolicy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetAtLocal = useMemo(() => {
    if (!result?.resetAt) {
      return 'n/a'
    }

    const asDate = new Date(result.resetAt)
    return Number.isNaN(asDate.valueOf()) ? result.resetAt : asDate.toLocaleString()
  }, [result?.resetAt])

  const handleTest = async () => {
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
    } catch (err) {
      setPolicy(null)
      setResult(null)
      setError(err instanceof Error ? err.message : 'Failed to run check')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="glass-card animate-rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <FlaskConical className="h-5 w-5 text-primary" />
          Live Rate Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
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
            <Input
              value={form.plan ?? ''}
              onChange={(event) => setForm({ ...form, plan: event.target.value })}
              placeholder="free"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Method</label>
            <select
              value={form.method}
              onChange={(event) => setForm({ ...form, method: event.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {methodOptions.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium">Route</label>
            <Input
              value={form.route}
              onChange={(event) => setForm({ ...form, route: event.target.value })}
              placeholder="/v1/search"
            />
          </div>
        </div>

        <Button onClick={handleTest} disabled={loading} className="w-full">
          {loading ? 'Testing Rate Limit...' : 'Run Rate Limit Check'}
        </Button>

        {error && <p className="text-sm font-medium text-deny">{error}</p>}

        {result && (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Decision</h4>
              <span
                className={`chip ${result.allowed ? 'border-success/50 bg-success/10 text-success' : 'border-deny/50 bg-deny/10 text-deny'}`}
              >
                {result.allowed ? 'Allowed' : 'Denied'}
              </span>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-card/80 p-3">
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="text-lg font-bold text-foreground">{result.remaining}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card/80 p-3">
                <p className="text-xs text-muted-foreground">Limit</p>
                <p className="text-lg font-bold text-foreground">{result.limit}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card/80 p-3">
                <p className="text-xs text-muted-foreground">Retry After</p>
                <p className="text-lg font-bold text-foreground">{result.retryAfterSeconds.toFixed(2)}s</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Reset at: {resetAtLocal}</p>

            {policy && (
              <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-card/80 p-3 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="font-semibold text-foreground">Policy: {policy.Name}</p>
                  <p>{policy.Descriptor}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
