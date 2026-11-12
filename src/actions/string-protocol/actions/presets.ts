import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, deviceIdentity, gidField, sidFromOptions, withGid } from './_shared'
import type { StringActionHost } from './_shared'
import { DeviceProtocolEnum } from '../../../common/types'
import { resolveDeviceModel } from '../../../common/device-models'
import { resolveCanvasTargetGid } from './canvas-target'

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
  const identity = deviceIdentity(host)
  const family = resolveDeviceModel(identity.protocol, identity.modelByte)?.family
  const usesCanvasTarget = family === 'V' || family === 'VX'
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- qp ----
  actions[ACTION_ID.QUICK_PRESET] = {
    name: 'Switch Quick Preset',
    description: usesCanvasTarget
      ? 'According to the current canvas mode, change the preset on PGM or PVW.'
      : 'Switch to the specified preset.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Preset index (1-based)',
        id: 'preset',
        min: 1,
        max: 64,
        default: 1
      },
      ...(usesCanvasTarget ? [] : [gidField()])
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; preset: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      if (!usesCanvasTarget) {
        await conn.sendOnly(CMD.QP, 'set', sid, withGid(o.gid, { preset: o.preset }))
        return
      }
      const target = await resolveCanvasTargetGid(conn, sid, 'Quick preset')
      if (target === undefined) return
      await conn.sendOnly(CMD.QP, 'set', sid, { preset: o.preset, gid: target })
    }
  }

  // ---- svpreset ----
  // A protocol does not support setting the preset name, only B protocol does.
  const isProtocolA = host.ctx.state.protocol === DeviceProtocolEnum.A
  const svpresetNameField = isProtocolA
    ? null
    : ({
        type: 'textinput',
        label: 'Preset name',
        id: 'name',
        default: 'preset1',
        useVariables: true
      } as const)

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
        default: 1
      },
      ...(svpresetNameField ? [svpresetNameField] : []),
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; preset: number; name?: string; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { preset: o.preset }
      if (!isProtocolA && typeof o.name === 'string') data.name = o.name
      withGid(o.gid, data)
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
        default: 1
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; preset: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = withGid(o.gid, { preset: o.preset })
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
        default: 1
      },
      {
        type: 'textinput',
        label: 'New name',
        id: 'name',
        default: 'preset1',
        minLength: 1,
        useVariables: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; idx: number; name: string; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = withGid(o.gid, { idx: o.idx, name: o.name })
      await conn.sendOnly(CMD.RPNAME, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}
