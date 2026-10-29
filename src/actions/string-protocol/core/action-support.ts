import type { CompanionActionDefinitions } from '@companion-module/base'
import { resolveDeviceModel } from '../../../device-models'
import { logger } from '../../../log'
import { ACTION_ID } from './ids'
import { ACTION_CMD } from './action-cmds'
import { isCmdOpSupported, type DeviceIdentity } from './cmd-support'

export type { DeviceIdentity } from './cmd-support'

/**
 * Filter a definitions object down to the set actions supported by the device.
 *
 * An action is kept when `ACTION_CMD` maps it to `'always'`, or when
 * `isCmdOpSupported(cmd, 'set', device)` is true. A missing map entry is
 * dropped. `'always'` stays registered even when the model is unresolved.
 */
export function filterActionsForDevice(
  actions: CompanionActionDefinitions,
  device: DeviceIdentity
): CompanionActionDefinitions {
  const modelResolved = resolveDeviceModel(device.protocol, device.modelByte) !== undefined

  const filtered: CompanionActionDefinitions = {}
  const removed: string[] = []
  for (const [id, def] of Object.entries(actions)) {
    const mapped = ACTION_CMD[id as ACTION_ID]
    const supported =
      mapped === 'always' || (typeof mapped === 'string' && isCmdOpSupported(mapped, 'set', device))
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
        ? `filterActionsForDevice: device model unresolved (protocol=${device.protocol}, modelByte=${device.modelByte}) — registered unrestricted action(s): ${kept.join(', ')}`
        : `filterActionsForDevice: device model unresolved (protocol=${device.protocol}, modelByte=${device.modelByte}) — no actions registered`
    )
  }

  if (removed.length > 0) {
    logger.debug(
      `filterActionsForDevice: removed ${removed.length} action(s) unsupported by protocol=${device.protocol} modelByte=${device.modelByte}: ${removed.join(', ')}`
    )
  }
  return filtered
}
