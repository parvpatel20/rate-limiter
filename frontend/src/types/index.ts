export interface MetricValue {
  name: string
  value: number
  labels?: Record<string, string>
}

export interface BackendPolicy {
  Name: string
  Descriptor: string
  Limit: number
  WindowSeconds: number
  Algorithm: 'token_bucket' | 'sliding_window'
}

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

export interface PoliciesResponse {
  tenant_id?: string
  policies?: BackendPolicy[]
}

export interface SimulateResponse {
  policy?: BackendPolicy
  total?: number
  allowed?: number
  denied?: number
}

export type CircuitState = 'closed' | 'open' | 'half_open'
