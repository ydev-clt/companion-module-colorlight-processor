import type { DeviceIdentity } from './common/cmd-support'
import {
  buildScreenGroupPlan,
  groupIdsFromPrGroup,
  managedGroupIds,
  pushedGroupToAdd,
  type ScreenGroupSlot
} from './variables/screen-groups'
import { valuesFromPush } from './variables/push'

export interface PushRouteInput {
  cmd: string
  code?: unknown
  data?: unknown
  identity: DeviceIdentity
  managedGroupIds: readonly number[] | null
  slots: readonly ScreenGroupSlot[]
}

export interface PushRouteResult {
  /** Replacement managed gid list, when this push changes it. */
  nextGroupIds?: number[]
  /** Variable leaves projected against the post-push plan. */
  values?: Record<string, number | string | object>
}

/**
 * Pure routing for one accepted push notice.
 *
 * `pr_group` replaces the whole managed list. Other commands may append one
 * missing gid when the command belongs on that gid, then project their leaves
 * against the updated plan. The caller applies the result in order.
 */
export function routePush(input: PushRouteInput): PushRouteResult {
  if (input.cmd === 'pr_group') {
    // An empty or unusable body must not wipe groups that are already managed.
    const parsed = groupIdsFromPrGroup({
      code: typeof input.code === 'number' ? input.code : undefined,
      data: input.data
    })
    if (parsed.length === 0) return {}
    return { nextGroupIds: managedGroupIds(input.identity, parsed) }
  }

  const addGid = pushedGroupToAdd(input.identity, input.cmd, input.data, input.managedGroupIds)
  const nextGroupIds =
    addGid !== undefined ? [...(input.managedGroupIds ?? []), addGid] : undefined
  const slots = nextGroupIds ? buildScreenGroupPlan(input.identity, nextGroupIds) : input.slots
  const values = valuesFromPush({ cmd: input.cmd, code: input.code, data: input.data }, input.identity, slots)
  const result: PushRouteResult = {}
  if (nextGroupIds) result.nextGroupIds = nextGroupIds
  if (Object.keys(values).length > 0) result.values = values
  return result
}
