const SECRET_KEYS = new Set([
  'password',
  'passwordPlain',
  'pin',
  'pinPlain',
  'confirmPassword',
  'confirmPin',
])

export function sanitizePayload(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => sanitizePayload(item))
  if (!input || typeof input !== 'object') return input

  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key)) continue
    output[key] = sanitizePayload(value)
  }
  return output
}

export function getPayloadUpdatedAt(payload: unknown, fallback: Date) {
  if (!payload || typeof payload !== 'object') return fallback
  const value = (payload as { updatedAt?: unknown }).updatedAt
  if (typeof value !== 'string') return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed
}
