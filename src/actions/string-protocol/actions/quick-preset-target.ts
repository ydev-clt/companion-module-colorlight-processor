export interface QuickPresetCanvas {
  gid: number
  canvasType: number
  fieldsValid: number
}

export function parseCanvasMode(data: unknown): 0 | 1 | undefined {
  if (data === null || typeof data !== 'object') return undefined
  const record = data as { valid?: unknown; mode?: unknown }
  if (record.valid !== 1) return undefined
  if (record.mode === 0 || record.mode === 1) return record.mode
  return undefined
}

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

export function selectQuickPresetGid(mode: 0 | 1, canvases: readonly QuickPresetCanvas[]): number | undefined {
  const canvasType = mode === 0 ? 1 : 2
  for (const canvas of canvases) {
    if (canvas.fieldsValid === 1 && canvas.canvasType === canvasType) return canvas.gid
  }
  return undefined
}
