import { DeviceProtocolEnum } from './common/types'
import type { DeviceIdentity } from './common/cmd-support'
import { downlinkChecksumForFamily, resolveDeviceModel } from './common/device-models'
import { logger } from './common/log'
import type { Connection } from './connection'
import type { SPTransmitter } from './actions/string-protocol/core/transmitter'

export interface SessionBindDeps {
  transmitter: Pick<SPTransmitter, 'bindSpSession' | 'setOnPush' | 'subscribePush' | 'startHeartbeat'>
  connection: Pick<Connection, 'beginReceiving'>
  /** Read again at bind time; the probe result has already been applied. */
  identity: () => DeviceIdentity
  /** False when the config/link changed while bind or subscribe was in flight. */
  isCurrent: (generation: number) => boolean
  onPush: (item: Record<string, unknown>) => void
  onHeartbeatLost: () => void
  onBindFailed: (err: Error) => void
  startInitialPoll: (generation: number) => void
  discoverInputSources: (generation: number) => void
  /** Put heartbeat requests behind the same lock as action callbacks. */
  runSerialized: (fn: () => Promise<unknown>) => Promise<unknown>
}

/**
 * Bind the String-Protocol session, then start the business receive path.
 *
 * Order matters: push subscription is installed before `beginReceiving`, and
 * heartbeat / initial poll start only after `subscribePush` resolves. Every
 * await rechecks the link generation so a late bind cannot touch a newer
 * session.
 */
export async function bindSession(generation: number, deps: SessionBindDeps): Promise<void> {
  const identity = deps.identity()
  if (identity.protocol === DeviceProtocolEnum.None) return

  const proto = identity.protocol === DeviceProtocolEnum.A ? 1 : 2
  const model = resolveDeviceModel(identity.protocol, identity.modelByte)
  const downlinkChecksum = downlinkChecksumForFamily(model?.family)

  try {
    await deps.transmitter.bindSpSession(proto, { downlinkChecksum })
    if (!deps.isCurrent(generation)) return

    deps.transmitter.setOnPush((item) => {
      if (!deps.isCurrent(generation)) return
      deps.onPush(item)
    })
    deps.connection.beginReceiving()

    const subscribed = await deps.transmitter.subscribePush()
    if (!subscribed) {
      logger.warn('comm_obj subscribe was not sent; continuing with heartbeat and initial poll')
    }
    if (!deps.isCurrent(generation)) return

    deps.transmitter.startHeartbeat(deps.onHeartbeatLost, deps.runSerialized)
    deps.startInitialPoll(generation)
    deps.discoverInputSources(generation)
  } catch (err) {
    if (!deps.isCurrent(generation)) return
    const error = err instanceof Error ? err : new Error(String(err))
    logger.error(`bindSpSession failed: ${error.message}`)
    deps.onBindFailed(error)
  }
}
