import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { ACTION_ID } from '../core/ids'
import { logger } from '../../../log'
import type { StringActionHost } from './_shared'

/** Even-length hex bytes, same rule as the Z/V custom command. */
const HEX_COMMAND = /^([0-9A-Fa-f]{2})+$/

type OptionValues = {
  command: string
}

/**
 * Raw hex command.
 *
 * The payload is written straight to the UDP socket and is not encoded by
 * SpSession. Use it when the frame is already a device binary command.
 */
export function setupCustomActions(host: StringActionHost): CompanionActionDefinitions {
  const action: CompanionActionDefinition = {
    name: 'Custom command',
    description: 'Send a raw hexadecimal frame.',
    options: [
      {
        id: 'command',
        label: 'Command',
        type: 'textinput',
        default: '',
        required: true,
        regex: '^([0-9A-Fa-f]{2})+$'
      }
    ],
    callback: async (event) => {
      const { command } = event.options as OptionValues

      if (!HEX_COMMAND.test(command)) {
        logger.error('Invalid command')
        return
      }

      const sendBuf = Buffer.from(command, 'hex')
      if (sendBuf.byteLength <= 0) return

      const ok = await host.ctx.send(sendBuf)
      if (!ok) {
        logger.warn('send custom command failed')
        return
      }
      logger.info('send custom command')
    }
  }

  return {
    [ACTION_ID.RAW_COMMAND]: action
  }
}
