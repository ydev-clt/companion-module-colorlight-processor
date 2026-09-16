import type { CompanionActionDefinitions } from '@companion-module/base'
/** Make the SPTransmitter type also available for consumers */
import { SPTransmitter } from './core/transmitter'
import type { ActionContext } from '../../types'
import { logger } from '../../log'
import type { StringActionHost } from './actions/_shared'
import { filterActionsForDevice } from './core/action-support'
import { setupDisplayActions } from './actions/display'
import { setupPictureActions } from './actions/picture'
import { setupPresetActions } from './actions/presets'
import { setupLayerActions } from './actions/layers'
import { setupPortActions } from './actions/ports'
import { setupAudio3dActions } from './actions/audio-3d'
import { setupColorActions } from './actions/color'
import { setupDeviceActions } from './actions/device'
import { setupSystemActions } from './actions/system'
import { setupMfcActions } from './actions/mfc'
import { setupProbeActions } from './actions/probe'

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
  ctx: ActionContext,
  conn: SPTransmitter,
  setVariableValues: (values: Record<string, number | string | object>) => void
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
    ...setupMfcActions(host),
    ...setupProbeActions(host)
  }

  // Single filtering point: drop actions not supported by the current device
  // identity. Global strict: an unresolved model registers nothing.
  const all = filterActionsForDevice(merged, {
    protocol: ctx.config.protocol,
    modelByte: ctx.state.modelByte
  })

  logger.info(`String-Protocol actions setup completed. (${Object.keys(all).length} actions registered)`)
  return all
}

/** Re-export types and constants */
export { ACTION_ID as STRING_ACTION_ID } from './core/ids'
export { CMD as STRING_CMD } from './core/constants'
export { FEEDBACK_ID as STRING_FEEDBACK_ID } from './core/ids'
