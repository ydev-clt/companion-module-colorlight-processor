import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, openCloseField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

/**
 * Device-related actions:
 *  - sn (§5.2.6)         Serial number read/write
 *  - edid_set (§5.2.20)  EDID configuration
 *  - brt_rela (§5.2.48)  Relative brightness adjustment
 *  - ct_rela (§5.2.49)   Relative color temperature adjustment
 *  - brt_step (§5.2.50)  Brightness step adjustment
 *  - vsync_mul (§5.2.51) VSYNC multiplier
 */

export function setupDeviceActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- sn ----
  actions[ACTION_ID.SN] = {
    name: 'Set Serial Number',
    description: 'Set the device serial number.',
    options: [
      ...deviceAndBroadcastFields({ allowSelectAll: false }),
      { type: 'textinput', label: 'Serial number', id: 'serial', default: '', required: true }
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; serial: string }
      const sid = sidFromOptions(false, o.deviceId)
      await conn.sendOnly(CMD.SN, 'set', sid, { serial: o.serial })
    }
  }

  // ---- edid_set ----
  actions[ACTION_ID.EDID_SET] = {
    name: 'Set EDID for Input Source',
    description: 'Set the EDID for an input source.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'Input source (1-based)', id: 'src', min: 1, max: 32, default: 1, required: true },
      {
        type: 'textinput',
        label: 'EDID hex (no spaces)',
        tooltip: 'EDID must be a continuous hex string without spaces.',
        id: 'edid',
        default: '',
        regex: '^[0-9A-Fa-f]+$'
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; src: number; edid: string; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { src: o.src, edid: o.edid }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.EDID_SET, 'set', sid, data)
    }
  }

  // ---- brt_rela ----
  actions[ACTION_ID.BRT_RELA] = {
    name: 'Brightness Relative',
    description: 'Adjust brightness by a relative value.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Delta',
        id: 'delta',
        tooltip: 'Brightness delta: positive values increase, negative values decrease.',
        min: -10000,
        max: 10000,
        default: 0,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; delta: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { delta: o.delta }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.BRT_RELA, 'set', sid, data)
    }
  }

  // ---- ct_rela ----
  actions[ACTION_ID.CT_RELA] = {
    name: 'Color Temp Relative',
    description: 'Adjust color temperature by a relative value.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Delta (K)',
        id: 'delta',
        tooltip: 'Color temperature delta in Kelvin: positive values increase, negative values decrease.',
        min: -10000,
        max: 10000,
        default: 0,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; delta: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { delta: o.delta }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.CT_RELA, 'set', sid, data)
    }
  }

  // ---- brt_step ----
  actions[ACTION_ID.BRT_STEP] = {
    name: 'Brightness Step',
    description: 'Adjust brightness by an integer step value.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Step',
        id: 'step',
        tooltip: 'Step value: positive values increase, negative values decrease.',
        min: Number.MIN_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
        default: 1,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; step: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { step: o.step }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.BRT_STEP, 'set', sid, data)
    }
  }

  // ---- vsync_mul ----
  actions[ACTION_ID.VSYNC_MUL] = {
    name: 'VSYNC Multiplier',
    description: 'Set the VSYNC multiplier parameters for the sender (en/method/mul).',
    options: [
      ...deviceAndBroadcastFields(),
      openCloseField(1),
      {
        type: 'dropdown',
        label: 'Method',
        id: 'method',
        tooltip:
          'VSYNC multiplier method: auto / specify multiplier. Note: Multiplier only takes effect when method="specify multiplier".',
        default: 1,
        choices: [
          { id: 1, label: 'Specify multiplier' },
          { id: 0, label: 'Auto' }
        ]
      },
      {
        type: 'dropdown',
        label: 'Multiplier',
        id: 'mul',
        tooltip: 'VSYNC multiplier. Only takes effect when method="specify multiplier".',
        default: 0,
        choices: [
          { id: 0, label: 'None' },
          { id: 1, label: '2x' },
          { id: 2, label: '3x' },
          { id: 3, label: '4x' },
          { id: 4, label: '5x' },
          { id: 5, label: '6x' },
          { id: 6, label: '7x' },
          { id: 7, label: '8x' },
          { id: 8, label: '9x' },
          { id: 9, label: '10x' }
        ]
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        openStatus: number
        method: number
        mul: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus, method: o.method, mul: o.mul }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.VSYNC_MUL, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}
