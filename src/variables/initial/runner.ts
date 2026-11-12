import type { Cmd } from '../../common/commands'
import type { DeviceIdentity } from '../../common/cmd-support'
import type { ScreenGroupSlot } from '../screen-groups'
import { publishVariableId } from '../publish'
import { selectPollRequests, projectPollData, type PollRequest } from './catalog'

export interface InitialPollArgs {
  identity: DeviceIdentity
  slots: readonly ScreenGroupSlot[]
  isCurrent: () => boolean
  slotStillPublished?: (cmd: Cmd, gid: number) => boolean
  send: (request: PollRequest) => Promise<{ code: number; data?: unknown } | undefined>
  write: (values: Record<string, number | string | object>) => void
  log: (message: string) => void
}

/**
 * Walk the startup requests in slot order. One failed get is logged and skipped;
 * it does not abort the rest of the poll or drop the link.
 * `isCurrent` stops the walk when the link generation changes, so a late
 * response is not written onto the new session.
 * `slotStillPublished` drops a screen result whose gid left the live plan
 * after this request was sent.
 */
export async function runInitialPoll(args: InitialPollArgs): Promise<void> {
  const requests = selectPollRequests(args.identity, args.slots)
  for (const request of requests) {
    if (!args.isCurrent()) return
    let response: { code: number; data?: unknown } | undefined
    try {
      response = await args.send(request)
    } catch (err) {
      args.log(failureLine(request, err))
      continue
    }
    if (!args.isCurrent()) return
    if (!response || response.code !== 0) {
      args.log(failureLine(request))
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
function failureLine(request: PollRequest, err?: unknown): string {
  const reason = err instanceof Error ? `: ${err.message}` : ''
  const gid = request.gid === undefined ? '' : ` gid=${request.gid}`
  return `initial poll ${request.cmd} failed${gid}${reason}`
}
