export function projectPortOutput(data: unknown): Record<string, number> | undefined {
  if (!data || typeof data !== 'object') return undefined
  const ports = (data as { ports?: unknown }).ports
  if (!Array.isArray(ports)) return undefined
  const out: Record<string, number> = {}
  for (const item of ports) {
    if (!item || typeof item !== 'object') continue
    const idx = (item as { idx?: unknown }).idx
    const en = (item as { en?: unknown }).en
    if (typeof idx !== 'number' || typeof en !== 'number') continue
    if (!Number.isFinite(idx) || !Number.isFinite(en)) continue
    out[String(idx + 1)] = en
  }
  return out
}
