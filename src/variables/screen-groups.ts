import { isCmdOpSupported, type DeviceIdentity } from '../common/cmd-support'
import { resolveDeviceModel } from '../common/device-models'
import { parseGroupIds } from '../actions/string-protocol/actions/quick-preset-target'
import { POLL_CATALOG } from './initial/catalog'

/**
 * One `(cmd, gid)` plan shared by variable definitions, the initial poll,
 * and push writes. Definitions, gets, and writes all follow this list.
 * Resolved V and VX devices publish every command in the list once, on gid 1.
 */
export interface ScreenGroupSlot {
  cmd: string
  gid: number
}

/**
 * Screen-group commands a resolved V or VX device publishes.
 * Membership decides which commands enter the plan. Every slot uses gid 1.
 */
const V_VX_SCREEN_COMMANDS = [
  'bright',
  'colortemp',
  'freeze',
  'blackout',
  'testmode',
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

/**
 * Read `groupIds` from a `pr_group` get or push.
 * A missing response, an explicit non-zero code, or an unusable body all
 * become `[]`. A missing code counts as success. One invalid element rejects
 * the whole list, because `parseGroupIds` does.
 */
export function groupIdsFromPrGroup(response: { code?: unknown; data?: unknown } | undefined): number[] {
  if (response === undefined) return []
  if (typeof response.code === 'number' && response.code !== 0) return []
  return parseGroupIds(response.data) ?? []
}

/**
 * Gids this device actually keeps, in first-seen order.
 * V and VX keep only 1 and 2. Every other family, including an unresolved
 * model, keeps each remaining gid.
 */
export function managedGroupIds(device: DeviceIdentity, parsedIds: readonly number[]): number[] {
  const ids = distinctGroupIds(parsedIds)
  if (!isVvxDevice(device)) return ids
  return ids.filter((gid) => gid === 1 || gid === 2)
}

/**
 * Value of the existing `screen_group_count` variable.
 * `count` is this list's length. The device's own `groupCount` field is not used.
 * The id array is copied so a later edit of the caller's list cannot change the published value.
 */
export function screenGroupCountValue(ids: readonly number[]): { count: number; ids: number[] } {
  return { count: ids.length, ids: [...ids] }
}

/**
 * Gid a non-`pr_group` push may append, or `undefined` when it must not.
 * `currentIds === null` means no list exists yet and is treated as empty.
 * Resolved V and VX return `undefined`: their variables stay on screen group 1,
 * and `screen_group_count` changes only when `pr_group` replaces the list.
 * Other families require the command to appear on that gid in a one-gid plan.
 */
export function pushedGroupToAdd(
  device: DeviceIdentity,
  cmd: string,
  data: unknown,
  currentIds: readonly number[] | null
): number | undefined {
  if (isVvxDevice(device)) return undefined
  const gid = gidFromPush(data)
  if (gid === undefined) return undefined
  if ((currentIds ?? []).includes(gid)) return undefined
  const allowed = buildScreenGroupPlan(device, [gid])
  if (!allowed.some((slot) => slot.cmd === cmd && slot.gid === gid)) return undefined
  return gid
}

/**
 * Slots in gid-major order: managed gids in list order, and within a gid the
 * initial screen-group commands in catalog order. A command whose get side
 * this device does not support is left out.
 * Resolved V and VX emit one gid-1 slot per supported command in
 * {@link V_VX_SCREEN_COMMANDS} when the managed list contains 1 or 2.
 */
export function buildScreenGroupPlan(device: DeviceIdentity, groupIds: readonly number[]): ScreenGroupSlot[] {
  const ids = managedGroupIds(device, groupIds)
  const commands = POLL_CATALOG.filter((entry) => entry.phase === 'initial' && entry.scope === 'screen-group').map(
    (entry) => entry.cmd
  )
  if (isVvxDevice(device)) return vvxScreenGroupPlan(ids, commands, device)
  const slots: ScreenGroupSlot[] = []
  for (const gid of ids) {
    for (const cmd of commands) {
      if (!isCmdOpSupported(cmd, 'get', device)) continue
      slots.push({ cmd, gid })
    }
  }
  return slots
}

/**
 * One gid-1 slot for each V/VX screen command whose get this device supports.
 * An empty result means the managed list has neither screen group 1 nor 2.
 * @param ids Managed gids, already limited to 1 and 2 for V/VX.
 * @param commands Initial screen-group commands in catalog order.
 */
function vvxScreenGroupPlan(
  ids: readonly number[],
  commands: readonly string[],
  device: DeviceIdentity
): ScreenGroupSlot[] {
  if (!ids.some((gid) => gid === 1 || gid === 2)) return []
  const allow = new Set<string>(V_VX_SCREEN_COMMANDS)
  const slots: ScreenGroupSlot[] = []
  for (const cmd of commands) {
    if (!allow.has(cmd)) continue
    if (!isCmdOpSupported(cmd, 'get', device)) continue
    slots.push({ cmd, gid: 1 })
  }
  return slots
}

/**
 * True only for a resolved family of `V` or `VX`.
 * An unresolved model is not V/VX and keeps one variable set per gid.
 */
export function isVvxDevice(device: DeviceIdentity): boolean {
  const family = resolveDeviceModel(device.protocol, device.modelByte)?.family
  return family === 'V' || family === 'VX'
}

/**
 * First occurrence of each integer gid at least 1.
 * Unlike `parseGroupIds`, a bad element is skipped instead of rejecting the list.
 */
function distinctGroupIds(ids: readonly number[]): number[] {
  const out: number[] = []
  for (const id of ids) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) continue
    if (!out.includes(id)) out.push(id)
  }
  return out
}

/**
 * Gid carried by a screen-group push.
 * Missing data, a non-object, or a missing `gid` means group 1.
 * A present but unusable `gid` (not an integer, or below 1) means the push
 * names no group, and does not fall back to 1.
 */
function gidFromPush(data: unknown): number | undefined {
  if (data === null || typeof data !== 'object') return 1
  const gid = (data as { gid?: unknown }).gid
  if (gid === undefined) return 1
  if (typeof gid !== 'number' || !Number.isInteger(gid) || gid < 1) return undefined
  return gid
}
