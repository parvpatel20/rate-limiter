import { useState } from 'react'
import { ListFilter, ShieldCheck, Timer } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import type { BackendPolicy, PoliciesResponse } from '../types'

function algorithmLabel(algorithm: BackendPolicy['Algorithm']) {
  return algorithm === 'sliding_window' ? 'Sliding Window' : 'Token Bucket'
}

export default function PolicyViewer() {
  const [tenantId, setTenantId] = useState('acme')
  const [policies, setPolicies] = useState<BackendPolicy[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedTenant, setLoadedTenant] = useState<string | null>(null)

  const handleLoadPolicies = async () => {
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
    } catch (err) {
      setPolicies([])
      setLoadedTenant(null)
      setError(err instanceof Error ? err.message : 'Failed to load policies')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="glass-card animate-rise">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <ListFilter className="h-5 w-5 text-primary" />
            Policy Explorer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Fetch effective policies for any tenant and inspect limits, algorithm, and matching descriptors.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              placeholder="Tenant ID (for example: acme)"
              className="sm:max-w-sm"
            />
            <Button onClick={handleLoadPolicies} disabled={loading} className="sm:w-auto">
              {loading ? 'Loading...' : 'Load Policies'}
            </Button>
          </div>
          {error && <p className="text-sm font-medium text-deny">{error}</p>}
        </CardContent>
      </Card>

      {loadedTenant && (
        <div className="space-y-3 animate-rise">
          <p className="text-sm text-muted-foreground">
            Loaded <span className="font-semibold text-foreground">{policies.length}</span> policies for tenant{' '}
            <span className="font-semibold text-foreground">{loadedTenant}</span>.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {policies.map((policy) => (
              <Card key={`${policy.Name}-${policy.Descriptor}`} className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">{policy.Name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="chip border-border bg-background/70 text-foreground">
                    {algorithmLabel(policy.Algorithm)}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="truncate">{policy.Descriptor}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Timer className="h-4 w-4" />
                    <span>
                      {policy.Limit} requests / {policy.WindowSeconds}s
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
