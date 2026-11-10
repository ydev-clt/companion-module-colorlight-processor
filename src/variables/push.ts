import type { DeviceIdentity } from '../common/cmd-support'
import { isCmdOpSupported } from '../common/cmd-support'
import { POLL_CATALOG, projectPollData } from './initial'
import { isVvxDevice, type ScreenGroupSlot } from './screen-groups'
import { publishVariableId } from './publish'

export interface PushNotice {
  cmd: string
  code?: unknown
  data?: unknown
}

/**
 * Map one push notice onto published Companion variable ids.
 * A missing code counts as success. A numeric non-zero code writes nothing.
 * A screen-group leaf is written only when the command is already in `slots`.
 * Other families also require the payload gid to match that slot.
 * Resolved V and VX ignore the payload gid and write the planned slot, which is screen group 1.
 * This does not add a gid; the caller appends one first when the push qualifies.
 * `pr_group` is reserved, so it returns `{}` and the caller writes `screen_group_count`.
 */
export function valuesFromPush(
  item: PushNotice,
  device: DeviceIdentity,
  slots: readonly ScreenGroupSlot[]
): Record<string, number | string | object> {
  if (typeof item.code === 'number' && item.code !== 0) return {}
  return projectPushData(item.cmd, item.data, device, slots)
}

/** Project a push onto leaves, or `{}` when the command is not an initial published slot. */
function projectPushData(
  cmd: string,
  data: unknown,
  device: DeviceIdentity,
  slots: readonly ScreenGroupSlot[]
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
  const slot = slotForPush(device, cmd, data, slots)
  if (!slot) return {}
  const out: Record<string, number | string | object> = {}
  for (const [leaf, value] of Object.entries(leaves)) {
    out[publishVariableId('screen-group', leaf, slot.gid)] = value
  }
  return out
}

/**
 * Planned slot this push updates.
 * V and VX keep a single slot per command, so any payload gid writes that slot.
 * Other families write nothing unless `(cmd, gid)` is planned.
 */
function slotForPush(
  device: DeviceIdentity,
  cmd: string,
  data: unknown,
  slots: readonly ScreenGroupSlot[]
): ScreenGroupSlot | undefined {
  if (isVvxDevice(device)) return slots.find((slot) => slot.cmd === cmd)
  const gid = screenGroupId(data)
  return slots.find((slot) => slot.cmd === cmd && slot.gid === gid)
}

/** Missing body or a missing, non-numeric, or non-finite `gid` is group 1. */
function screenGroupId(data: unknown): number {
  if (data === null || typeof data !== 'object') return 1
  const gid = (data as Record<string, unknown>).gid
  return typeof gid === 'number' && Number.isFinite(gid) ? gid : 1
}
