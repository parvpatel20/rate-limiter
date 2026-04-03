import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parsePromMetrics(text: string): Record<string, number> {
  const metrics: Record<string, number> = {}

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const parts = line.split(/\s+/)
    if (parts.length < 2) {
      continue
    }

    const metricKey = parts[0]
    const metricValue = Number(parts[parts.length - 1])
    if (!Number.isFinite(metricValue)) {
      continue
    }

    metrics[metricKey] = metricValue

    const baseName = metricKey.split('{')[0]
    if (baseName === metricKey) {
      metrics[baseName] = metricValue
    } else {
      metrics[baseName] = (metrics[baseName] ?? 0) + metricValue
    }
  }

  return metrics
}

export function pickMetricByLabels(metrics: Record<string, number>, metricName: string, labels: string[]): number {
  return Object.entries(metrics)
    .filter(([key]) => key.startsWith(`${metricName}{`) && labels.every((label) => key.includes(label)))
    .reduce((acc, [, value]) => acc + value, 0)
}
