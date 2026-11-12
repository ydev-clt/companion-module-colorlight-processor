import { CMD } from './common/commands'
import type { DeviceIdentity } from './common/cmd-support'
import {
  addedGroupIds,
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
  /** Gids this push added to the managed list; absent when it added none. */
  addedGroupIds?: number[]
  /** Variable leaves projected against the post-push plan. */
  values?: Record<string, number | string | object>
}

/**
 * Pure routing for one accepted push notice.
 *
 * `pr_group` replaces the whole managed list. Other commands may append one
 * missing gid when the command belongs on that gid, then project their leaves
 * against the updated plan. The caller applies the result in order: replace
 * the managed list, sync every added gid with gets, then write the projected
 * leaves. A push only carries the leaves the device chose to broadcast, so the
 * added gids need that one-shot get to fill the rest.
 */
export function routePush(input: PushRouteInput): PushRouteResult {
  if (input.cmd === CMD.PR_GROUP) {
    // An empty or unusable body must not wipe groups that are already managed.
    const parsed = groupIdsFromPrGroup({
      code: typeof input.code === 'number' ? input.code : undefined,
      data: input.data
    })
    if (parsed.length === 0) return {}
    const nextGroupIds = managedGroupIds(input.identity, parsed)
    const added = addedGroupIds(input.managedGroupIds, nextGroupIds)
    return added.length > 0 ? { nextGroupIds, addedGroupIds: added } : { nextGroupIds }
  }

  const addGid = pushedGroupToAdd(input.identity, input.cmd, input.data, input.managedGroupIds)
  const nextGroupIds = addGid !== undefined ? [...(input.managedGroupIds ?? []), addGid] : undefined
  const slots = nextGroupIds ? buildScreenGroupPlan(input.identity, nextGroupIds) : input.slots
  const values = valuesFromPush({ cmd: input.cmd, code: input.code, data: input.data }, input.identity, slots)
  const result: PushRouteResult = {}
  if (nextGroupIds) {
    result.nextGroupIds = nextGroupIds
    result.addedGroupIds = addedGroupIds(input.managedGroupIds, nextGroupIds)
  }
  if (Object.keys(values).length > 0) result.values = values
  return result
}
