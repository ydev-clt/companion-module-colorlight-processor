import type { DeviceIdentity } from '../common/cmd-support'
import { isCmdOpSupported } from '../common/cmd-support'
import { POLL_CATALOG, projectPollData } from './initial'
import { publishVariableId } from './publish'

export interface PushNotice {
  cmd: string
  code?: unknown
  data?: unknown
}

/**
 * Map one push notice onto published Companion variable ids.
 * A missing code counts as success. A numeric non-zero code writes nothing.
 */
export function valuesFromPush(
  item: PushNotice,
  device: DeviceIdentity,
  publishedGroupIds: readonly number[]
): Record<string, number | string | object> {
  if (typeof item.code === 'number' && item.code !== 0) return {}
  return projectPushData(item.cmd, item.data, device, publishedGroupIds)
}

function projectPushData(
  cmd: string,
  data: unknown,
  device: DeviceIdentity,
  publishedGroupIds: readonly number[]
): Record<string, number | string | object> {
  const entry = POLL_CATALOG.find((candidate) => candidate.cmd === cmd)
  if (!entry || entry.phase !== 'initial') return {}
  if (!isCmdOpSupported(cmd, 'get', device)) return {}
  const leaves = projectPollData(cmd, data)
  if (Object.keys(leaves).length === 0) return {}
  if (entry.scope === 'device') {
    const out: Record<string, number | string | object> = {}
    for (const [leaf, value] of Object.entries(leaves)) {
      out[publishVariableId('device', leaf)] = value
    }
    return out
  }
  const gid = screenGroupId(data)
  if (!publishedGroupIds.includes(gid)) return {}
  const out: Record<string, number | string | object> = {}
  for (const [leaf, value] of Object.entries(leaves)) {
    out[publishVariableId('screen-group', leaf, gid)] = value
  }
  return out
}

function screenGroupId(data: unknown): number {
  if (data === null || typeof data !== 'object') return 1
  const gid = (data as Record<string, unknown>).gid
  return typeof gid === 'number' && Number.isFinite(gid) ? gid : 1
}
