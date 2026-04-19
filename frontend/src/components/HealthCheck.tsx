import { useCallback, useState } from 'react'
import { 
  Heart, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  AlertTriangle,
  Wifi,
  Clock
} from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import type { HealthStatus } from '../types'

export default function HealthCheck() {
  const [tenantId, setTenantId] = useState('acme')
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{ status: HealthStatus; timestamp: Date }>>([])

  const handleCheck = useCallback(async () => {
    setLoading(true)
    const startTime = performance.now()

    try {
      const response = await fetch('/api/', {
        method: 'GET',
        headers: {
          'X-Tenant-ID': tenantId,
          'X-Request-Time': new Date().toISOString(),
        },
      })

      const latencyMs = Math.round(performance.now() - startTime)
      const text = await response.text()

      let next: HealthStatus
      if (response.ok) {
        next = {
          status: 'healthy',
          latencyMs,
          statusCode: response.status,
          timestamp: new Date(),
        }
      } else if (response.status === 429) {
        next = {
          status: 'degraded',
          latencyMs,
          statusCode: response.status,
          timestamp: new Date(),
          error: 'Rate limited but service is responding',
        }
      } else {
        next = {
          status: 'unhealthy',
          latencyMs,
          statusCode: response.status,
          timestamp: new Date(),
          error: text || 'Unexpected response',
        }
      }
      setHealthStatus(next)
      setHistory(prev => [{ status: next, timestamp: new Date() }, ...prev.slice(0, 9)])
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime)
      setHealthStatus({
        status: 'unhealthy',
        latencyMs,
        statusCode: 0,
        timestamp: new Date(),
        error: err instanceof Error ? err.message : 'Connection failed',
      })
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  const getStatusIcon = (status: HealthStatus['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-6 w-6 text-success" />
      case 'degraded':
        return <AlertTriangle className="h-6 w-6 text-warn" />
      case 'unhealthy':
        return <XCircle className="h-6 w-6 text-deny" />
    }
  }

  const getStatusColor = (status: HealthStatus['status']) => {
    switch (status) {
      case 'healthy':
        return 'border-success/30 bg-success/10'
      case 'degraded':
        return 'border-warn/30 bg-warn/10'
      case 'unhealthy':
        return 'border-deny/30 bg-deny/10'
    }
  }

  return (
    <div className="space-y-6">
      {/* Health Check Card */}
      <Card className="glass-card animate-rise">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Heart className="h-5 w-5 text-primary" />
            Health Probe
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Test the health of the rate limiter service by sending a request with a tenant header.
            This endpoint is rate-limited like any other protected route.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
                placeholder="Tenant ID (e.g., acme)"
              />
            </div>
            <Button 
              onClick={handleCheck} 
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Heart className="h-4 w-4" />
                  Check Health
                </>
              )}
            </Button>
          </div>

          {healthStatus && (
            <div className={`rounded-xl border p-5 ${getStatusColor(healthStatus.status)}`}>
              <div className="flex items-center gap-4">
                {getStatusIcon(healthStatus.status)}
                <div className="flex-1">
                  <p className="text-lg font-semibold text-foreground capitalize">
                    {healthStatus.status}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Latency: {healthStatus.latencyMs}ms
                    </span>
                    <span>
                      Status: {healthStatus.statusCode || 'Connection Failed'}
                    </span>
                  </div>
                  {healthStatus.error && (
                    <p className="mt-1 text-sm text-deny">{healthStatus.error}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connection Info Card */}
      <Card className="glass-card animate-rise" style={{ animationDelay: '50ms' }}>
        <CardHeader>
          <CardTitle className="text-base">Endpoint Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wifi className="h-4 w-4" />
                Backend URL
              </div>
              <p className="mt-1 font-mono text-sm text-foreground">http://localhost:8080</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Heart className="h-4 w-4" />
                Health Endpoint
              </div>
              <p className="mt-1 font-mono text-sm text-foreground">GET /</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4" />
                Success Status
              </div>
              <p className="mt-1 font-mono text-sm text-foreground">200 OK</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <XCircle className="h-4 w-4" />
                Rate Limited Status
              </div>
              <p className="mt-1 font-mono text-sm text-foreground">429 Too Many Requests</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card className="glass-card animate-rise" style={{ animationDelay: '100ms' }}>
          <CardHeader>
            <CardTitle className="text-base">Recent Health Checks ({history.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((item, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card/50 p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(item.status.status)}
                    <span className={`font-medium ${
                      item.status.status === 'healthy' ? 'text-success' :
                      item.status.status === 'degraded' ? 'text-warn' : 'text-deny'
                    }`}>
                      {item.status.status.charAt(0).toUpperCase() + item.status.status.slice(1)}
                    </span>
                    <span className="text-muted-foreground">
                      ({item.status.statusCode || 'Failed'})
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Latency: {item.status.latencyMs}ms</span>
                    <span>{item.timestamp.toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
