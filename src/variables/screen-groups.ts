import { isCmdOpSupported, type DeviceIdentity } from '../common/cmd-support'
import { resolveDeviceModel } from '../common/device-models'
import { parseGroupIds } from '../actions/string-protocol/actions/quick-preset-target'
import { POLL_CATALOG } from './initial/catalog'

export interface ScreenGroupSlot {
  cmd: string
  gid: number
}

const V_GID_1 = ['freeze', 'blackout', 'testmode'] as const
const V_GID_2 = [
  'bright',
  'colortemp',
  'c_depth',
  'ct_r',
  'ct_g',
  'ct_b',
  'low_gray',
  'canvas_mode',
  'canvas_switch_mode',
  'out_fps',
  'vsync_src'
] as const

export function groupIdsFromPrGroup(response: { code?: unknown; data?: unknown } | undefined): number[] {
  if (response === undefined) return []
  if (typeof response.code === 'number' && response.code !== 0) return []
  return parseGroupIds(response.data) ?? []
}

export function managedGroupIds(device: DeviceIdentity, parsedIds: readonly number[]): number[] {
  const ids = distinctGroupIds(parsedIds)
  if (!isVvx(device)) return ids
  return ids.filter((gid) => gid === 1 || gid === 2)
}

export function screenGroupCountValue(ids: readonly number[]): { count: number; ids: number[] } {
  return { count: ids.length, ids: [...ids] }
}

export function pushedGroupToAdd(
  device: DeviceIdentity,
  cmd: string,
  data: unknown,
  currentIds: readonly number[] | null
): number | undefined {
  const gid = gidFromPush(data)
  if (gid === undefined) return undefined
  if ((currentIds ?? []).includes(gid)) return undefined
  const allowed = buildScreenGroupPlan(device, [gid])
  if (!allowed.some((slot) => slot.cmd === cmd && slot.gid === gid)) return undefined
  return gid
}

export function buildScreenGroupPlan(device: DeviceIdentity, groupIds: readonly number[]): ScreenGroupSlot[] {
  const ids = managedGroupIds(device, groupIds)
  const commands = POLL_CATALOG.filter((entry) => entry.phase === 'initial' && entry.scope === 'screen-group').map(
    (entry) => entry.cmd
  )
  const slots: ScreenGroupSlot[] = []
  for (const gid of ids) {
    const allow = isVvx(device) ? (gid === 1 ? V_GID_1 : V_GID_2) : undefined
    for (const cmd of commands) {
      if (allow !== undefined && !allow.some((item) => item === cmd)) continue
      if (!isCmdOpSupported(cmd, 'get', device)) continue
      slots.push({ cmd, gid })
    }
  }
  return slots
}

function isVvx(device: DeviceIdentity): boolean {
  const family = resolveDeviceModel(device.protocol, device.modelByte)?.family
  return family === 'V' || family === 'VX'
}

function distinctGroupIds(ids: readonly number[]): number[] {
  const out: number[] = []
  for (const id of ids) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) continue
    if (!out.includes(id)) out.push(id)
  }
  return out
}

function gidFromPush(data: unknown): number | undefined {
  if (data === null || typeof data !== 'object') return 1
  const gid = (data as { gid?: unknown }).gid
  if (gid === undefined) return 1
  if (typeof gid !== 'number' || !Number.isInteger(gid) || gid < 1) return undefined
  return gid
}
