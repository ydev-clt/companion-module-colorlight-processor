/**
 * Shared parsers for protocol payloads used by more than one layer.
 * Keeping them here lets `variables/` read probe data without importing
 * from `actions/`.
 */

/**
 * Deduplicated `gid` list from a `pr_group` body.
 * A missing/non-array value, an empty list, or one invalid element returns
 * `undefined`; the caller treats the whole list as unusable.
 */
export function parseGroupIds(data: unknown): number[] | undefined {
  if (data === null || typeof data !== 'object') return undefined
  const groupIds = (data as { groupIds?: unknown }).groupIds
  if (!Array.isArray(groupIds) || groupIds.length === 0) return undefined
  const ids: number[] = []
  for (const id of groupIds) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) return undefined
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}
