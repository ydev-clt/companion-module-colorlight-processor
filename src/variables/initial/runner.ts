import type { Cmd } from '../../common/commands'
import type { DeviceIdentity } from '../../common/cmd-support'
import type { ScreenGroupSlot } from '../screen-groups'
import { publishVariableId } from '../publish'
import { selectScreenRequests, selectPollRequests, projectPollData, type PollRequest } from './catalog'

export interface InitialPollArgs {
  identity: DeviceIdentity
  slots: readonly ScreenGroupSlot[]
  isCurrent: () => boolean
  slotStillPublished?: (cmd: Cmd, gid: number) => boolean
  /**
   * Set to false for the one-shot sync after a push adds a screen group: it
   * sends only the screen-group slots and skips the device-wide requests,
   * which the startup poll already covered.
   */
  includeDeviceRequests?: boolean
  /** Prefix of the skip warnings. Defaults to `initial poll`. */
  logLabel?: string
  send: (request: PollRequest) => Promise<{ code: number; data?: unknown } | undefined>
  write: (values: Record<string, number | string | object>) => void
  log: (message: string) => void
}

/**
 * Walk the requested gets in slot order. One failed get is logged and skipped;
 * it does not abort the rest of the walk or drop the link.
 * `isCurrent` stops the walk when the link generation changes, so a late
 * response is not written onto the new session.
 * `slotStillPublished` drops a screen result whose gid left the live plan
 * after this request was sent.
 *
 * Used by the startup poll and by the one-shot sync after a push adds a
 * screen group (with `includeDeviceRequests: false`).
 */
export async function runInitialPoll(args: InitialPollArgs): Promise<void> {
  const requests =
    args.includeDeviceRequests === false
      ? selectScreenRequests(args.slots)
      : selectPollRequests(args.identity, args.slots)
  const label = args.logLabel ?? 'initial poll'
  for (const request of requests) {
    if (!args.isCurrent()) return
    let response: { code: number; data?: unknown } | undefined
    try {
      response = await args.send(request)
    } catch (err) {
      args.log(failureLine(label, request, err))
      continue
    }
    if (!args.isCurrent()) return
    if (!response || response.code !== 0) {
      args.log(failureLine(label, request))
      continue
    }
    const leaves = projectPollData(request.cmd, response.data)
    if (Object.keys(leaves).length === 0) continue
    if (!args.isCurrent()) return
    const scope = request.gid === undefined ? 'device' : 'screen-group'
    const values: Record<string, number | string | object> = {}
    for (const [leaf, value] of Object.entries(leaves)) {
      values[publishVariableId(scope, leaf, request.gid)] = value
    }
    // The request list is this poll's snapshot. Recheck the live plan so a
    // gid removed while the get was in flight is not written back.
    if (request.gid !== undefined && args.slotStillPublished && !args.slotStillPublished(request.cmd, request.gid)) {
      continue
    }
    args.write(values)
  }
}

/** One warning line for a skipped get. A thrown error appends its message. */
function failureLine(label: string, request: PollRequest, err?: unknown): string {
  const reason = err instanceof Error ? `: ${err.message}` : ''
  const gid = request.gid === undefined ? '' : ` gid=${request.gid}`
  return `${label} ${request.cmd} failed${gid}${reason}`
}
