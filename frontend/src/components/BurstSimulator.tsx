import { useState } from 'react'
import { Activity, Gauge } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import type { SimulateResponse } from '../types'

type SimulatorForm = {
  tenant_id: string
  user_id: string
  route: string
  method: string
  plan: string
  requests_per_second: number
  duration_seconds: number
}

const defaultForm: SimulatorForm = {
  tenant_id: 'acme',
  user_id: '',
  route: '/v1/search',
  method: 'GET',
  plan: 'free',
  requests_per_second: 25,
  duration_seconds: 10,
}

export default function BurstSimulator() {
  const [form, setForm] = useState<SimulatorForm>(defaultForm)
  const [result, setResult] = useState<SimulateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allowed = result?.allowed ?? 0
  const denied = result?.denied ?? 0
  const total = result?.total ?? 0
  const successRate = total > 0 ? (allowed / total) * 100 : 0

  const handleRunSimulation = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/v1/simulate', {
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

      const payload = JSON.parse(text) as SimulateResponse
      setResult(payload)
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : 'Failed to run simulation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <Card className="glass-card animate-rise">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Activity className="h-5 w-5 text-primary" />
            Burst Simulator
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium">Tenant ID</label>
            <Input
              value={form.tenant_id}
              onChange={(event) => setForm({ ...form, tenant_id: event.target.value })}
              placeholder="acme"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Plan</label>
            <Input
              value={form.plan}
              onChange={(event) => setForm({ ...form, plan: event.target.value })}
              placeholder="free"
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

          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium">Route</label>
            <Input
              value={form.route}
              onChange={(event) => setForm({ ...form, route: event.target.value })}
              placeholder="/v1/search"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Requests / second</label>
            <Input
              type="number"
              min={1}
              value={form.requests_per_second}
              onChange={(event) =>
                setForm({ ...form, requests_per_second: Number(event.target.value || 0) })
              }
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Duration (seconds)</label>
            <Input
              type="number"
              min={1}
              value={form.duration_seconds}
              onChange={(event) =>
                setForm({ ...form, duration_seconds: Number(event.target.value || 0) })
              }
            />
          </div>

          <div className="sm:col-span-2">
            <Button className="w-full" onClick={handleRunSimulation} disabled={loading}>
              {loading ? 'Running Simulation...' : 'Run Simulation'}
            </Button>
            {error && <p className="mt-2 text-sm font-medium text-deny">{error}</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card animate-rise">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Gauge className="h-5 w-5 text-primary" />
            Forecast
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!result && <p className="text-sm text-muted-foreground">Run a simulation to preview allow/deny behavior.</p>}
          {result && (
            <>
              <div className="space-y-2 rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Policy in use</p>
                <p className="text-base font-semibold text-foreground">{result.policy?.Name ?? 'n/a'}</p>
                <p className="text-xs text-muted-foreground">{result.policy?.Descriptor ?? 'n/a'}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">Allowed</p>
                  <p className="text-lg font-bold text-success">{allowed}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">Denied</p>
                  <p className="text-lg font-bold text-deny">{denied}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold text-foreground">{total}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Success rate</span>
                  <span className="font-semibold text-foreground">{successRate.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted">
                  <div
                    className="h-2.5 rounded-full bg-success transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, successRate))}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
