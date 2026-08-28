import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { DeviceProtocolEnum } from '../../../types'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

/**
 * Multi-function card / receiving card / module / audio preset actions:
 *  - mfc_manual       (§5.4.4)
 *  - ld_audpreset_id  (§5.4.12) (B protocol only)
 *  - ld_audpreset_idx (§5.4.13) (B protocol only)
 *  - restorehost      (§5.4.9)
 *  - reboot           (§5.4.14) (B protocol only)
 *  - shutdown         (§5.4.15)
 */

export function setupMfcActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- mfc_manual ----
  actions[ACTION_ID.MFC_MANUAL] = {
    name: 'MFC Relay Manual',
    description: 'Manually control the multi-function card relay.',
    options: [
      ...deviceAndBroadcastFields({ allowSelectAll: false }),
      {
        type: 'number',
        label: 'Network port',
        tooltip: 'Output network port index of the link where the multi-function card resides, starting from 1.',
        id: 'port',
        min: 1,
        max: 8,
        default: 1,
        required: true
      },
      {
        type: 'number',
        label: 'Relay mask',
        id: 'relayMask',
        tooltip: `Relay state bitmask: low-order bits bit0-bit6 correspond to relays 1-7. A bit set to 1 closes that relay in this frame; 0 releases (opens) it. Multiple relays can be written at once. To drive only relay 5 closed while all others remain open, the value is decimal 16 (0b10000, the 5th bit from bit0).`,
        min: 0,
        max: 255,
        default: 0,
        required: true
      },
      {
        type: 'number',
        label: 'Action delay',
        id: 'delaySec',
        tooltip: 'Delay before the relay action, in seconds. Use 0 for no delay.',
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        default: 0,
        required: true
      }
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; port: number; relayMask: number; delaySec: number }
      const sid = sidFromOptions(false, o.deviceId)
      await conn.sendOnly(CMD.MFC_MANUAL, 'set', sid, { port: o.port, relayMask: o.relayMask, delaySec: o.delaySec })
    }
  }

  // ---- ld_audpreset_id ----
  host.ctx.config.protocol === DeviceProtocolEnum.B &&
    (actions[ACTION_ID.LD_AUDPRESET_ID] = {
      name: 'Load Audio Preset by ID',
      description: 'Load an audio preset by its ID.',
      options: [
        ...deviceAndBroadcastFields(),
        {
          type: 'number',
          label: 'Preset ID',
          tooltip: 'Audio preset ID.',
          id: 'id',
          min: 0,
          max: Number.MAX_SAFE_INTEGER,
          default: 0,
          required: true
        }
      ],
      callback: async (event) => {
        const o = event.options as { deviceId: number; isSelectAll: boolean; id: number }
        const sid = sidFromOptions(o.isSelectAll, o.deviceId)
        // The `id` field may arrive as a string or number; send the user value through unchanged.
        const idValue = o.id
        await conn.sendOnly(CMD.LD_AUDPRESET_ID, 'set', sid, { id: idValue })
      }
    })

  // ---- ld_audpreset_idx ----
  host.ctx.config.protocol === DeviceProtocolEnum.B &&
    (actions[ACTION_ID.LD_AUDPRESET_IDX] = {
      name: 'Load Audio Preset by Index',
      description: 'Load an audio preset by its index.',
      options: [
        ...deviceAndBroadcastFields(),
        {
          type: 'number',
          label: 'Index (1-based)',
          id: 'idx',
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
          default: 1,
          required: true
        }
      ],
      callback: async (event) => {
        const o = event.options as { deviceId: number; isSelectAll: boolean; idx: number }
        const sid = sidFromOptions(o.isSelectAll, o.deviceId)
        await conn.sendOnly(CMD.LD_AUDPRESET_IDX, 'set', sid, { idx: o.idx })
      }
    })

  // ---- restorehost ----
  actions[ACTION_ID.RESTOREHOST] = {
    name: 'Restore Host Work',
    description: 'Restore the host to normal operation, typically after an abnormal state or to wake the device.',
    options: [...deviceAndBroadcastFields()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      await conn.sendOnly(CMD.RESTOREHOST, 'set', sid, { restore: 1 })
    }
  }

  // ---- reboot (dangerous) ----
  host.ctx.config.protocol === DeviceProtocolEnum.B &&
    (actions[ACTION_ID.REBOOT] = {
      name: '⚠ Reboot Device (dangerous)',
      description: 'Software restart of the device.',
      options: [...deviceAndBroadcastFields({ allowSelectAll: false })],
      callback: async (event) => {
        const o = event.options as { deviceId: number }
        const sid = sidFromOptions(false, o.deviceId)
        await conn.sendOnly(CMD.REBOOT, 'set', sid, { confirm: 1 })
      }
    })

  // ---- shutdown (dangerous) ----
  actions[ACTION_ID.SHUTDOWN] = {
    name: '⚠ Shutdown Device (dangerous)',
    description: 'Shut down the device.',
    options: [...deviceAndBroadcastFields({ allowSelectAll: false })],
    callback: async (event) => {
      const o = event.options as { deviceId: number }
      const sid = sidFromOptions(false, o.deviceId)
      await conn.sendOnly(CMD.SHUTDOWN, 'set', sid, { confirm: 1 })
    }
  }

  return actions as CompanionActionDefinitions
}
