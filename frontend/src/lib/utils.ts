import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse Prometheus text format metrics
 * Supports both simple metrics and labeled metrics
 */
export function parsePromMetrics(text: string): Record<string, number> {
  const metrics: Record<string, number> = {}
  const lines = text.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    // Handle HELP and TYPE lines (comments)
    if (trimmed.startsWith('HELP') || trimmed.startsWith('TYPE')) {
      continue
    }

    // Parse metric line: name{label1="value1",...} value
    // or: name value
    const parts = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(\{.*?\})?\s+([-+]?[\d.]+)(e[+-]?\d+)?$/)
    
    if (parts) {
      const [, name, labels, valueStr] = parts
      const value = parseFloat(valueStr)
      
      if (!Number.isNaN(value) && Number.isFinite(value)) {
        // Store labeled metric
        if (labels) {
          const fullKey = name + labels
          metrics[fullKey] = value
        }
        
        // Aggregate base metric name (sum all labels)
        metrics[name] = (metrics[name] ?? 0) + value
      }
    }
  }

  return metrics
}

/**
 * Extract a specific metric by name and filter by labels
 */
export function pickMetricByLabels(
  metrics: Record<string, number>,
  metricName: string,
  labels: string[]
): number {
  return Object.entries(metrics)
    .filter(([key]) => {
      if (!key.startsWith(`${metricName}{`)) {
        return false
      }
      return labels.every((label) => key.includes(label))
    })
    .reduce((acc, [, value]) => acc + value, 0)
}

/**
 * Get all metric keys matching a pattern
 */
export function getMetricsByPattern(
  metrics: Record<string, number>,
  pattern: RegExp
): Array<{ key: string; value: number }> {
  return Object.entries(metrics)
    .filter(([key]) => pattern.test(key))
    .map(([key, value]) => ({ key, value }))
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Format duration in seconds to human readable
 */
export function formatDuration(seconds: number): string {
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(0)}ms`
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}m ${secs}s`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

/**
 * Format large numbers with suffixes
 */
export function formatNumber(num: number): string {
  if (num === 0) return '0'
  if (num < 1000) return num.toString()
  if (num < 1000000) return `${(num / 1000).toFixed(1)}K`
  if (num < 1000000000) return `${(num / 1000000).toFixed(1)}M`
  return `${(num / 1000000000).toFixed(1)}B`
}

/**
 * Generate a random trace ID
 */
export function generateTraceId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}
