import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'
import { DeviceProtocolEnum } from '../../../common/types'
import { logger } from '../../../common/log'
import { resolveDeviceModel } from '../../../common/device-models'
import { parseCanvasMode, parseGroupIds, selectQuickPresetGid } from './quick-preset-target'

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
  const family = resolveDeviceModel(host.ctx.config.protocol, host.ctx.state.modelByte)?.family
  const usesCanvasTarget = family === 'V' || family === 'VX'
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- qp ----
  actions[ACTION_ID.QUICK_PRESET] = {
    name: 'Switch Quick Preset',
    description: usesCanvasTarget
      ? 'Switch to the specified preset. The gid reads canvas mode; the preset is sent to PGM or PVW.'
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
      usesCanvasTarget ? gidField(1, 128, 'Canvas mode screen group (gid)') : gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; preset: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      if (!usesCanvasTarget) {
        const data: Record<string, unknown> = { preset: o.preset }
        if (typeof o.gid === 'number') data.gid = o.gid
        await conn.sendOnly(CMD.QP, 'set', sid, data)
        return
      }
      if (typeof o.gid !== 'number' || !Number.isInteger(o.gid) || o.gid < 1) {
        logger.warn('Quick preset skipped: page gid is not an integer of at least 1.')
        return
      }
      const modeResp = await conn.sendAndAwait<{ gid: number }, { mode?: unknown; valid?: unknown }>(
        CMD.CANVAS_MODE,
        'get',
        sid,
        { gid: o.gid }
      )
      const mode = parseCanvasMode(modeResp?.code === 0 ? modeResp.data : undefined)
      if (mode === undefined) {
        logger.warn('Quick preset skipped: canvas_mode did not return mode 0 or 1.')
        return
      }
      const groupResp = await conn.sendAndAwait(CMD.PR_GROUP, 'get', sid)
      const groupIds = parseGroupIds(groupResp?.code === 0 ? groupResp.data : undefined)
      if (!groupIds) {
        logger.warn('Quick preset skipped: pr_group did not return group ids.')
        return
      }
      for (const gid of groupIds) {
        const canvasResp = await conn.sendAndAwait<
          { gid: number },
          { gid?: unknown; canvasType?: unknown; fieldsValid?: unknown }
        >(CMD.PR_CANVAS, 'get', sid, { gid })
        const canvas = canvasResp?.code === 0 ? canvasResp.data : undefined
        if (!canvas || canvas.gid !== gid) continue
        const target = selectQuickPresetGid(mode, [
          {
            gid,
            canvasType: typeof canvas.canvasType === 'number' ? canvas.canvasType : -1,
            fieldsValid: typeof canvas.fieldsValid === 'number' ? canvas.fieldsValid : 0
          }
        ])
        if (target === undefined) continue
        await conn.sendOnly(CMD.QP, 'set', sid, { preset: o.preset, gid: target })
        return
      }
      logger.warn(`Quick preset skipped: canvas mode ${mode} does not have a target canvas.`)
    }
  }

  // ---- svpreset ----
  // A protocol does not support setting the preset name, only B protocol does.
  const isProtocolA = host.ctx.config.protocol === DeviceProtocolEnum.A
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
        default: 1
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
      const data: Record<string, unknown> = { idx: o.idx, name: o.name }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.RPNAME, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}
