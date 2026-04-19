// ============ Metric Types ============

export interface MetricValue {
  name: string
  value: number
  labels?: Record<string, string>
}

export interface ParsedMetrics {
  raw: Record<string, number>
  allowed: number
  denied: number
  errors: number
  activeKeys: number
  fastAllow: number
  redisNeeded: number
  fastDeny: number
  redisLatencySamples: number
  circuitState: number
  policyCacheHits: number
  policyCacheMisses: number
}

// ============ Policy Types ============

export interface BackendPolicy {
  Name: string
  Descriptor: string
  Limit: number
  WindowSeconds: number
  Algorithm: 'token_bucket' | 'sliding_window'
}

// ============ Rate Limit Check Types ============

export interface RateCheckRequest {
  tenant_id: string
  user_id?: string
  route: string
  method: string
  plan?: string
}

export interface RateResult {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: string
  retryAfterSeconds: number
  policyName?: string
  policyDescriptor?: string
}

export interface CheckApiResponse {
  policy?: BackendPolicy
  result?: {
    Allowed?: boolean
    Remaining?: number
    Limit?: number
    ResetAt?: string
    RetryAfter?: number
  }
}

// ============ Policies Response Types ============

export interface PoliciesResponse {
  tenant_id?: string
  policies?: BackendPolicy[]
}

// ============ Simulation Types ============

export interface SimulateRequest {
  tenant_id: string
  user_id?: string
  route: string
  method: string
  plan?: string
  requests_per_second: number
  duration_seconds: number
}

export interface SimulateResponse {
  policy?: BackendPolicy
  total?: number
  allowed?: number
  denied?: number
}

// ============ Health Check Types ============

export interface HealthCheckResponse {
  status: string
  timestamp?: string
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  latencyMs: number
  statusCode: number
  timestamp: Date
  error?: string
}

// ============ Burst Test Types ============

export interface BurstResult {
  total: number
  allowed: number
  denied: number
  other: number
  allowedPercentage: number
  deniedPercentage: number
  otherPercentage: number
}

export interface BurstTestRequest {
  tenant_id: string
  route: string
  method: string
  count: number
}

// ============ Admin Types ============

export interface AdminReloadResponse {
  status: string
  message?: string
}

// ============ Circuit Breaker Types ============

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface CircuitBreakerInfo {
  state: CircuitState
  label: string
  colorClass: string
  bgClass: string
}

// ============ Tenant Types ============

export interface Tenant {
  id: string
  name: string
  plan: string
  isActive: boolean
}

export const DEMO_TENANTS: Tenant[] = [
  { id: 'acme', name: 'ACME Corp', plan: 'enterprise', isActive: true },
  { id: 'globex', name: 'Globex Industries', plan: 'free', isActive: true },
  { id: 'initech', name: 'Initech Systems', plan: 'free', isActive: true },
  { id: 'umbrella', name: 'Umbrella Corp', plan: 'enterprise', isActive: false },
]

// ============ Route Presets ============

export interface RoutePreset {
  path: string
  method: string
  description: string
  typicalLimit: string
}

export const ROUTE_PRESETS: RoutePreset[] = [
  { path: '/v1/search', method: 'GET', description: 'Search API', typicalLimit: '60/min' },
  { path: '/v1/login', method: 'POST', description: 'Authentication', typicalLimit: '10/min' },
  { path: '/v1/data', method: 'GET', description: 'Data Retrieval', typicalLimit: '100/min' },
  { path: '/v1/data', method: 'POST', description: 'Data Submission', typicalLimit: '20/min' },
  { path: '/v1/stream', method: 'GET', description: 'Streaming API', typicalLimit: '5/min' },
  { path: '/v1/export', method: 'POST', description: 'Data Export', typicalLimit: '5/min' },
]

// ============ API Error Types ============

export interface ApiError {
  message: string
  code?: string
  statusCode?: number
  details?: string
}

// ============ Connection Status Types ============

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface ConnectionInfo {
  status: ConnectionStatus
  backendUrl: string
  lastPing?: Date
  latencyMs?: number
}
