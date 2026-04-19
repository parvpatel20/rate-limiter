/** Parse optional digit-only input; empty or invalid falls back to default. */
export function parseOptionalPositiveInt(
  raw: string,
  defaultVal: number,
  min: number,
  max: number,
): number {
  const t = raw.trim()
  if (t === '') {
    return defaultVal
  }
  const n = parseInt(t, 10)
  if (Number.isNaN(n)) {
    return defaultVal
  }
  return Math.min(max, Math.max(min, n))
}

/** Keep only digits so users can clear the field and type a new number. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}
