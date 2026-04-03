import { useCallback, useEffect, useState } from 'react'
import { parsePromMetrics } from '../lib/utils'

export function useMetrics() {
  const [metrics, setMetrics] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const fetchMetrics = useCallback(async (showLoader: boolean) => {
    try {
      if (showLoader) {
        setLoading(true)
      }

      const response = await fetch('/api/metrics')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const text = await response.text()
      const parsed = parsePromMetrics(text)
      setMetrics(parsed)
      setError(null)
      setLastUpdated(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (showLoader) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void fetchMetrics(true)
    const interval = setInterval(() => {
      void fetchMetrics(false)
    }, 5000)

    return () => clearInterval(interval)
  }, [fetchMetrics])

  const refresh = useCallback(async () => {
    await fetchMetrics(true)
  }, [fetchMetrics])

  return { metrics, loading, error, lastUpdated, refresh }
}
