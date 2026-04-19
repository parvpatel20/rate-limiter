import { useCallback, useState } from 'react'
import { 
  ListFilter, 
  ShieldCheck, 
  Timer, 
  Loader2,
  AlertCircle,
  Hash,
  Zap,
  Search
} from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import type { BackendPolicy, PoliciesResponse } from '../types'

function AlgorithmBadge({ algorithm }: { algorithm: BackendPolicy['Algorithm'] }) {
  const isSliding = algorithm === 'sliding_window'
  return (
    <span className={`chip gap-1 ${isSliding ? 'border-primary/50 bg-primary/10 text-primary' : 'border-warn/50 bg-warn/10 text-warn'}`}>
      <Zap className="h-3 w-3" />
      {isSliding ? 'Sliding Window' : 'Token Bucket'}
    </span>
  )
}

function PolicyCard({ policy }: { policy: BackendPolicy }) {
  return (
    <Card className="glass-card transition-all hover:border-primary/30 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-foreground truncate">{policy.Name}</h4>
              <AlgorithmBadge algorithm={policy.Algorithm} />
            </div>
            
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Hash className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-mono text-xs">{policy.Descriptor}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-semibold text-foreground">{policy.Limit.toLocaleString()}</span> requests
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Timer className="h-3.5 w-3.5 shrink-0" />
                <span>
                  per <span className="font-semibold text-foreground">{policy.WindowSeconds}</span> seconds
                </span>
              </div>
            </div>

            {/* Rate Display */}
            <div className="mt-3 rounded-lg bg-muted/50 p-2">
              <p className="text-xs text-muted-foreground">
                Rate: <span className="font-semibold text-foreground">
                  {(policy.Limit / policy.WindowSeconds).toFixed(2)} req/s
                </span>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function PolicyViewer() {
  const [tenantId, setTenantId] = useState('acme')
  const [policies, setPolicies] = useState<BackendPolicy[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedTenant, setLoadedTenant] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const handleLoadPolicies = useCallback(async () => {
    const tenant = tenantId.trim()
    if (!tenant) {
      setError('Tenant ID is required.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/v1/policies/${encodeURIComponent(tenant)}`)
      const text = await response.text()
      if (!response.ok) {
        throw new Error(text || `HTTP ${response.status}`)
      }

      const payload = JSON.parse(text) as PoliciesResponse
      setPolicies(payload.policies ?? [])
      setLoadedTenant(payload.tenant_id ?? tenant)
      setLastRefreshed(new Date())
    } catch (err) {
      setPolicies([])
      setLoadedTenant(null)
      setError(err instanceof Error ? err.message : 'Failed to load policies')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  const handleQuickLoad = useCallback((tenant: string) => {
    setTenantId(tenant)
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('#tenant-input')
      if (input) {
        input.value = tenant
      }
    }, 0)
  }, [])

  // Group policies by type
  const groupedPolicies = policies.reduce((acc, policy) => {
    if (policy.Descriptor.includes('tenant:') && policy.Descriptor.includes('user:')) {
      acc.user.push(policy)
    } else if (policy.Descriptor.includes('tenant:') && policy.Descriptor.includes('route:')) {
      acc.route.push(policy)
    } else if (policy.Descriptor.includes('plan:')) {
      acc.plan.push(policy)
    } else if (policy.Descriptor === 'global:default') {
      acc.global.push(policy)
    } else {
      acc.other.push(policy)
    }
    return acc
  }, { global: [] as BackendPolicy[], plan: [] as BackendPolicy[], route: [] as BackendPolicy[], user: [] as BackendPolicy[], other: [] as BackendPolicy[] })

  return (
    <div className="space-y-6">
      {/* Search Card */}
      <Card className="glass-card animate-rise">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Search className="h-5 w-5 text-primary" />
            Policy Explorer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Fetch and inspect effective rate limiting policies for any tenant. 
            Policies define limits, algorithms, and matching criteria.
          </p>
          
          {/* Quick Access Buttons */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Quick Access</label>
            <div className="flex flex-wrap gap-2">
              {['acme', 'globex', 'initech'].map(tenant => (
                <button
                  key={tenant}
                  onClick={() => handleQuickLoad(tenant)}
                  className="chip cursor-pointer border-border bg-background/70 text-muted-foreground transition-all hover:border-primary hover:bg-primary/10 hover:text-primary"
                >
                  {tenant}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                id="tenant-input"
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
                placeholder="Enter tenant ID (e.g., acme)"
                className="w-full"
              />
            </div>
            <Button 
              onClick={handleLoadPolicies} 
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Load Policies
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-deny/50 bg-deny/10 p-3 text-deny">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {lastRefreshed && (
            <p className="text-xs text-muted-foreground">
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {loadedTenant && (
        <div className="space-y-6 animate-rise">
          {/* Summary Header */}
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/60 p-4">
            <div>
              <p className="text-sm text-muted-foreground">Showing policies for</p>
              <p className="text-xl font-bold text-foreground">
                Tenant: <span className="text-primary">{loadedTenant}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Policies</p>
              <p className="text-3xl font-bold text-primary">{policies.length}</p>
            </div>
          </div>

          {/* Algorithm Distribution */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-warn/10 p-2">
                    <Zap className="h-5 w-5 text-warn" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {groupedPolicies.plan.filter(p => p.Algorithm === 'token_bucket').length}
                    </p>
                    <p className="text-sm text-muted-foreground">Token Bucket Policies</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-2">
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {groupedPolicies.plan.filter(p => p.Algorithm === 'sliding_window').length}
                    </p>
                    <p className="text-sm text-muted-foreground">Sliding Window Policies</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Policy Sections */}
          {groupedPolicies.global.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Global Policies
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupedPolicies.global.map((policy, idx) => (
                  <PolicyCard key={`global-${idx}`} policy={policy} />
                ))}
              </div>
            </div>
          )}

          {groupedPolicies.plan.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Zap className="h-5 w-5 text-warn" />
                Plan-Based Policies
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupedPolicies.plan.map((policy, idx) => (
                  <PolicyCard key={`plan-${idx}`} policy={policy} />
                ))}
              </div>
            </div>
          )}

          {groupedPolicies.route.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <ListFilter className="h-5 w-5 text-primary" />
                Route-Specific Policies
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupedPolicies.route.map((policy, idx) => (
                  <PolicyCard key={`route-${idx}`} policy={policy} />
                ))}
              </div>
            </div>
          )}

          {groupedPolicies.user.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Hash className="h-5 w-5 text-primary" />
                User-Specific Policies
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupedPolicies.user.map((policy, idx) => (
                  <PolicyCard key={`user-${idx}`} policy={policy} />
                ))}
              </div>
            </div>
          )}

          {groupedPolicies.other.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <ListFilter className="h-5 w-5 text-muted-foreground" />
                Other Policies
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupedPolicies.other.map((policy, idx) => (
                  <PolicyCard key={`other-${idx}`} policy={policy} />
                ))}
              </div>
            </div>
          )}

          {policies.length === 0 && !loading && !error && (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No policies found for this tenant.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Help Card */}
      {!loadedTenant && (
        <Card className="glass-card animate-rise" style={{ animationDelay: '100ms' }}>
          <CardHeader>
            <CardTitle className="text-base">How Policy Matching Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Policies are matched using a hierarchical approach. The most specific 
              policy takes precedence:
            </p>
            <ol className="list-inside list-decimal space-y-2">
              <li><strong className="text-foreground">User-Specific:</strong> Matches for individual users (highest priority)</li>
              <li><strong className="text-foreground">Route-Specific:</strong> Matches for specific routes with tenant/plan</li>
              <li><strong className="text-foreground">Plan-Based:</strong> Matches based on subscription plan</li>
              <li><strong className="text-foreground">Global Default:</strong> Fallback policy if no specific match</li>
            </ol>
            <p>
              Each policy defines a <strong className="text-foreground">limit</strong> and{' '}
              <strong className="text-foreground">window</strong>, using either Token Bucket 
              or Sliding Window algorithm.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
