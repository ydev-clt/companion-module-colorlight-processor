import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ActionContext } from '../types'
import { logger } from '../log'
import { setupStringActions, type SPTransmitter } from './string-protocol'

/**
 * Initialize actions.
 *
 * After refactor: the action set is unified to String-Protocol. The V/Z byte-stream
 * template actions (src/actions/zv-protocol/) are kept as source but are no
 * longer registered. `config.protocol` only decides which proto (1=Z, 2=V)
 * the SpSession uses; it no longer affects the action-registration branch.
 */
export function setupActions(context: ActionContext, spTransmitter: SPTransmitter): CompanionActionDefinitions {
  logger.info('Actions setup start')
  return context.config.protocol === 'None' ? {} : setupStringActions(context, spTransmitter)
}
