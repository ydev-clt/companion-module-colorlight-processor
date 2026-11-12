import type { CompanionActionDefinitions } from '@companion-module/base'
/** Make the SPTransmitter type also available for consumers */
import { SPTransmitter } from './core/transmitter'
import type { CltProcessorType } from '../../common/types'
import { logger } from '../../common/log'
import type { StringActionHost } from './actions/_shared'
import { filterActionsForDevice } from './core/action-support'
import { ActionMutex } from './core/action-mutex'
import { setupDisplayActions } from './actions/display'
import { setupPictureActions } from './actions/picture'
import { setupPresetActions } from './actions/presets'
import { setupLayerActions } from './actions/layers'
import { setupPortActions } from './actions/ports'
import { setupAudio3dActions } from './actions/audio-3d'
import { setupColorActions } from './actions/color'
import { setupDeviceActions } from './actions/device'
import { setupSystemActions } from './actions/system'
import { setupCanvasActions } from './actions/canvas'
import { setupMfcActions } from './actions/mfc'
import { setupCustomActions } from './actions/custom'

/**
 * String-Protocol entry point.
 *
 *  - Internally wires up all action + feedback registrations.
 *  - Dependency: the caller (CltProcessor) holds a SPTransmitter instance
 *    (typically a singleton).
 */

export { SPTransmitter } from './core/transmitter'

/**
 * Register all actions into a single object.
 *  Note: `conn` is usually injected by the module entry point; here we just
 *  combine ctx and conn into one host.
 */
export function setupStringActions(
  ctx: CltProcessorType,
  conn: SPTransmitter,
  setVariableValues: (values: Record<string, number | string | object>) => void,
  mutex: ActionMutex = new ActionMutex()
): CompanionActionDefinitions {
  logger.info('String-Protocol actions setup start.')

  const host: StringActionHost = { ctx, conn, setVariableValues }
  const merged: CompanionActionDefinitions = {
    ...setupDisplayActions(host),
    ...setupPictureActions(host),
    ...setupPresetActions(host),
    ...setupLayerActions(host),
    ...setupPortActions(host),
    ...setupAudio3dActions(host),
    ...setupColorActions(host),
    ...setupDeviceActions(host),
    ...setupSystemActions(host),
    ...setupCanvasActions(host),
    ...setupMfcActions(host),
    ...setupCustomActions(host)
  }

  // Single filtering point: keep a set action when its command supports set
  // on this device. `string_raw_command` stays even when the model is unresolved.
  const all = filterActionsForDevice(merged, {
    protocol: ctx.config.protocol,
    modelByte: ctx.state.modelByte
  })

  // Companion may fire action callbacks in parallel; serialize every String
  // action so multi-step set→get stays atomic. The mutex belongs to the
  // instance, not to one registration pass, so re-registering actions does not
  // create a second lock while a callback is still running.
  for (const def of Object.values(all)) {
    if (!def || typeof def.callback !== 'function') continue
    const original = def.callback as (...args: never[]) => Promise<unknown> | unknown
    ;(def as { callback: typeof original }).callback = (...args) => mutex.run(() => Promise.resolve(original(...args)))
  }

  logger.info(`String-Protocol actions setup completed. (${Object.keys(all).length} actions registered)`)
  return all
}
