import type { DeviceIdentity } from '../../common/cmd-support'
import { publishVariableId } from '../publish'
import { selectPollRequests, projectPollData, type PollRequest } from './catalog'

export interface InitialPollArgs {
  identity: DeviceIdentity
  groupIds: readonly number[]
  isCurrent: () => boolean
  send: (request: PollRequest) => Promise<{ code: number; data?: unknown } | undefined>
  write: (values: Record<string, number | string | object>) => void
  log: (message: string) => void
}

export async function runInitialPoll(args: InitialPollArgs): Promise<void> {
  const requests = selectPollRequests(args.identity, args.groupIds)
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
    args.write(values)
  }
}

function failureLine(request: PollRequest, err?: unknown): string {
  const reason = err instanceof Error ? `: ${err.message}` : ''
  const gid = request.gid === undefined ? '' : ` gid=${request.gid}`
  return `initial poll ${request.cmd} failed${gid}${reason}`
}
