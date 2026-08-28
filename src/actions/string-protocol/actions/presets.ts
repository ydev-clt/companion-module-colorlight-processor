import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

/**
 * Preset actions:
 *  - qp        Switch quick preset       (§5.2.8)
 *  - svpreset  Save preset               (§5.2.9)
 *  - ldpreset  Load preset               (§5.2.10)
 *  - rpname    Rename preset             (§5.2.47)
 *
 * Preset indexes are 1-based; an out-of-range index results in code=9008.
 */

export function setupPresetActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- qp ----
  actions[ACTION_ID.QUICK_PRESET] = {
    name: 'Switch Quick Preset',
    description: 'Switch to the specified preset.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Preset index (1-based)',
        id: 'preset',
        min: 1,
        max: 64,
        default: 1,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; preset: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { preset: o.preset }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.QP, 'set', sid, data)
    }
  }

  // ---- svpreset ----
  actions[ACTION_ID.SAVE_PRESET] = {
    name: 'Save Preset',
    description: 'Save the current parameters as a preset.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Preset index (1-based)',
        id: 'preset',
        min: 1,
        max: 64,
        default: 1,
        required: true
      },
      {
        type: 'textinput',
        label: 'Preset name',
        id: 'name',
        default: 'preset1',
        required: false
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; preset: number; name: string; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { preset: o.preset, name: o.name }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.SVPRESET, 'set', sid, data)
    }
  }

  // ---- ldpreset ----
  actions[ACTION_ID.LOAD_PRESET] = {
    name: 'Load Preset',
    description: 'Load the specified preset parameters.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Preset index (1-based)',
        id: 'preset',
        min: 1,
        max: 64,
        default: 1,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; preset: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { preset: o.preset }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.LDPRESET, 'set', sid, data)
    }
  }

  // ---- rpname ----
  actions[ACTION_ID.RENAME_PRESET] = {
    name: 'Rename Preset',
    description: 'Rename the specified preset.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Preset index (1-based)',
        id: 'idx',
        min: 1,
        max: 64,
        default: 1,
        required: true
      },
      {
        type: 'textinput',
        label: 'New name',
        id: 'name',
        default: 'preset1',
        required: true
      }
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; idx: number; name: string }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { idx: o.idx, name: o.name }
      await conn.sendOnly(CMD.RPNAME, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}
