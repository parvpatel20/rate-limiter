import { useCallback, useState } from 'react'
import { 
  Settings, 
  RefreshCw, 
  Shield, 
  Key,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lock,
  FileText,
  History,
  EyeOff,
} from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'

interface ReloadResponse {
  status: string
  message?: string
}

interface ConfigInfo {
  name: string
  description: string
  value: string
  type: 'text' | 'password' | 'number' | 'boolean'
}

export default function AdminPanel() {
  const [adminSecret, setAdminSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReloadResponse | null>(null)
  const [history, setHistory] = useState<Array<{ response: ReloadResponse; timestamp: Date; success: boolean }>>([])

  const handleReload = useCallback(async () => {
    if (!adminSecret.trim()) {
      setResult({ status: 'error', message: 'Admin secret is required' })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/v1/admin/reload', {
        method: 'POST',
        headers: {
          'X-Admin-Secret': adminSecret,
        },
      })

      const text = await response.text()
      
      if (response.ok) {
        const data = JSON.parse(text) as ReloadResponse
        setResult(data)
        setHistory(prev => [{
          response: data,
          timestamp: new Date(),
          success: true,
        }, ...prev.slice(0, 9)])
      } else {
        const errorResult = { status: 'error', message: text || `HTTP ${response.status}` }
        setResult(errorResult)
        setHistory(prev => [{
          response: errorResult,
          timestamp: new Date(),
          success: false,
        }, ...prev.slice(0, 9)])
      }
    } catch (err) {
      const errorResult = { 
        status: 'error', 
        message: err instanceof Error ? err.message : 'Failed to reload policies' 
      }
      setResult(errorResult)
      setHistory(prev => [{
        response: errorResult,
        timestamp: new Date(),
        success: false,
      }, ...prev.slice(0, 9)])
    } finally {
      setLoading(false)
    }
  }, [adminSecret])

  // Example configurations
  const exampleConfigs: ConfigInfo[] = [
    { 
      name: 'ADMIN_SECRET', 
      description: 'Secret key for admin operations',
      value: 'your-secret-key-here',
      type: 'password'
    },
    { 
      name: 'REDIS_URL', 
      description: 'Redis connection URL',
      value: 'redis://localhost:6379',
      type: 'text'
    },
    { 
      name: 'PORT', 
      description: 'Server port',
      value: '8080',
      type: 'number'
    },
    { 
      name: 'FAILURE_MODE', 
      description: 'Circuit breaker failure mode (open/closed)',
      value: 'open',
      type: 'text'
    },
  ]

  return (
    <div className="space-y-6">
      {/* Policy Reload Card */}
      <Card className="glass-card animate-rise">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Settings className="h-5 w-5 text-primary" />
            Admin Operations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Manage rate limiter operations including policy reloading and configuration.
            Requires admin secret for authentication.
          </p>

          {/* Reload Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <RefreshCw className="h-5 w-5 text-primary" />
              Reload Policies
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">
                Trigger an immediate reload of rate limiting policies from the YAML configuration file.
                This allows you to update policies without restarting the service.
              </p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Key className="h-4 w-4" />
                Admin Secret
              </label>
              <div className="relative">
                <Input
                  type="password"
                  value={adminSecret}
                  onChange={(event) => setAdminSecret(event.target.value)}
                  placeholder="Enter admin secret from .env"
                  className="pr-10"
                />
                <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <Button 
              onClick={handleReload} 
              disabled={loading || !adminSecret.trim()}
              className="w-full gap-2"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reloading...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Reload Policies
                </>
              )}
            </Button>

            {result && (
              <div className={`rounded-xl border p-4 ${
                result.status === 'ok' 
                  ? 'border-success/30 bg-success/10' 
                  : 'border-deny/30 bg-deny/10'
              }`}>
                <div className="flex items-start gap-3">
                  {result.status === 'ok' ? (
                    <CheckCircle className="h-5 w-5 shrink-0 text-success mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0 text-deny mt-0.5" />
                  )}
                  <div>
                    <p className={`font-semibold ${result.status === 'ok' ? 'text-success' : 'text-deny'}`}>
                      {result.status === 'ok' ? 'Success' : 'Error'}
                    </p>
                    <p className="text-sm text-muted-foreground">{result.message || result.status}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuration Reference */}
      <Card className="glass-card animate-rise" style={{ animationDelay: '50ms' }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5 text-primary" />
            Configuration Reference
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These environment variables configure the rate limiter service. Set them in your{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env</code> file.
          </p>

          <div className="space-y-3">
            {exampleConfigs.map((config) => (
              <div key={config.name} className="rounded-lg border border-border/50 bg-card/50 p-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <code className="font-mono text-sm font-semibold text-primary">{config.name}</code>
                    <p className="mt-1 text-xs text-muted-foreground">{config.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {config.type === 'password' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                        <EyeOff className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-mono tracking-wider">masked</span>
                      </span>
                    ) : (
                      <code className="rounded bg-muted/50 px-2 py-1 font-mono text-xs">
                        {config.value}
                      </code>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Security Info */}
      <Card className="glass-card animate-rise" style={{ animationDelay: '100ms' }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" />
            Security Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p>
              The admin secret should be a strong, randomly generated string. Never commit 
              secrets to version control.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              Failed authentication attempts are logged. The rate limiter uses the admin secret 
              only for protected operations like policy reloading.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p>
              Policies are automatically reloaded every 30 seconds. Manual reload is useful 
              for testing changes before the next auto-reload.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card className="glass-card animate-rise" style={{ animationDelay: '150ms' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-5 w-5 text-primary" />
              Operation History ({history.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((item, idx) => (
                <div 
                  key={idx}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    item.success ? 'border-success/30 bg-success/5' : 'border-deny/30 bg-deny/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.success ? (
                      <CheckCircle className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-deny" />
                    )}
                    <span className="text-sm font-medium">
                      Policy Reload: {item.response.status}
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
