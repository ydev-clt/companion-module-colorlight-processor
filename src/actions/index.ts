import type { CompanionActionDefinitions } from '@companion-module/base'
import type { CltProcessorType } from '../common/types'
import { logger } from '../common/log'
import { setupStringActions, type SPTransmitter } from './string-protocol'

/**
 * Initialize actions.
 *
 * After refactor: the action set is unified to String-Protocol. The V/Z byte-stream
 * template actions (src/actions/zv-protocol/) are kept as source but are no
 * longer registered. `config.protocol` only decides which proto (1=Z, 2=V)
 * the SpSession uses; it no longer affects the action-registration branch.
 *
 * `setVariableValues` is the variable writeback hook installed by
 * CltProcessor. Get-actions invoke it on every successful response so the
 * latest device state is reflected in Companion variables.
 */
export function setupActions(
  context: CltProcessorType,
  spTransmitter: SPTransmitter,
  setVariableValues: (values: Record<string, number | string | object>) => void
): CompanionActionDefinitions {
  logger.info('Actions setup start')
  // None means the probe has not identified a device yet. Registering actions
  // before that would show commands the device may not support.
  return context.config.protocol === 'None' ? {} : setupStringActions(context, spTransmitter, setVariableValues)
}
