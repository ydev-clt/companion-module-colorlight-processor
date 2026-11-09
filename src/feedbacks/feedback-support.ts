import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import { resolveDeviceModel } from '../common/device-models'
import { logger } from '../common/log'
import { isCmdOpSupported, type DeviceIdentity } from '../common/cmd-support'
import { FEEDBACK_ID } from '../common/feedback-ids'
import { FEEDBACK_CMD } from './feedback-cmds'

/**
 * Filter a definitions object down to the feedbacks whose get command this device supports.
 *
 * A feedback is kept when `FEEDBACK_CMD` maps it to `'always'`, or when
 * `isCmdOpSupported(cmd, 'get', device)` is true. A missing map entry is
 * dropped. `'always'` stays registered even when the model is unresolved.
 */
export function filterFeedbacksForDevice(
  feedbacks: CompanionFeedbackDefinitions,
  device: DeviceIdentity
): CompanionFeedbackDefinitions {
  const modelResolved = resolveDeviceModel(device.protocol, device.modelByte) !== undefined

  const filtered: CompanionFeedbackDefinitions = {}
  const removed: string[] = []
  for (const [id, def] of Object.entries(feedbacks)) {
    const mapped = FEEDBACK_CMD[id as FEEDBACK_ID]
    const supported =
      mapped === 'always' || (typeof mapped === 'string' && isCmdOpSupported(mapped, 'get', device))
    if (supported) {
      filtered[id] = def
    } else {
      removed.push(id)
    }
  }

  if (!modelResolved) {
    const kept = Object.keys(filtered)
    logger.warn(
      kept.length > 0
        ? `filterFeedbacksForDevice: device model unresolved (protocol=${device.protocol}, modelByte=${device.modelByte}) — registered unrestricted feedback(s): ${kept.join(', ')}`
        : `filterFeedbacksForDevice: device model unresolved (protocol=${device.protocol}, modelByte=${device.modelByte}) — no feedbacks registered`
    )
  }

  if (removed.length > 0) {
    logger.debug(
      `filterFeedbacksForDevice: removed ${removed.length} feedback(s) unsupported by protocol=${device.protocol} modelByte=${device.modelByte}: ${removed.join(', ')}`
    )
  }
  return filtered
}
