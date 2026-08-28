import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { DeviceProtocolEnum } from '../../../types'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

/**
 * Audio / 3D actions:
 *  - eye_switch   (§5.2.21)
 *  - mode3d       (§5.2.11.1 / §5.2.11.2)
 *  - dual_3d      (§5.2.11.3) (B protocol only)
 *  - stereo_fmt   (§5.2.11.4)
 */

export function setupAudio3dActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- eye_switch ----
  actions[ACTION_ID.EYE_SWITCH] = {
    name: 'Eye Switch (Left/Right)',
    description: 'Set left/right eye output.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Eye',
        id: 'eye',
        default: 0,
        choices: [
          { id: 0, label: 'Left eye' },
          { id: 1, label: 'Right eye' }
        ]
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; eye: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { eye: o.eye }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.EYE_SWITCH, 'set', sid, data)
    }
  }

  // ---- mode3d ----
  actions[ACTION_ID.MODE3D] = {
    name: '3D Switch',
    description: 'Enable or disable the sender 3D output.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: '3D',
        id: 'openStatus',
        default: 1,
        choices: [
          { id: 1, label: 'On' },
          { id: 0, label: 'Off' }
        ]
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.MODE3D, 'set', sid, data)
    }
  }

  // ---- dual_3d ----
  host.ctx.config.protocol === DeviceProtocolEnum.B &&
    (actions[ACTION_ID.DUAL_3D] = {
      name: 'Single/Dual 3D Mode',
      description:
        'Set the screen group to single 3D or dual 3D mode. The device typically requires `mode3d` to be enabled before switching single/dual.',
      options: [
        ...deviceAndBroadcastFields(),
        {
          type: 'dropdown',
          label: 'Mode',
          id: 'mode',
          default: 0,
          choices: [
            { id: 0, label: 'Single 3D' },
            { id: 1, label: 'Dual 3D' }
          ]
        },
        gidField()
      ],
      callback: async (event) => {
        const o = event.options as { deviceId: number; isSelectAll: boolean; mode: 0 | 1; gid?: number }
        const sid = sidFromOptions(o.isSelectAll, o.deviceId)
        const data: Record<string, unknown> = { mode: o.mode }
        if (typeof o.gid === 'number') data.gid = o.gid
        await conn.sendOnly(CMD.DUAL_3D, 'set', sid, data)
      }
    })

  // ---- stereo_fmt ----
  actions[ACTION_ID.STEREO_FMT] = {
    name: 'Stereo 3D Source Format',
    description: 'Set the 3D source format.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Format',
        id: 'fmt',
        default: 0,
        choices: [
          { id: 0, label: 'Side-by-side/Top-and-bottom' },
          { id: 1, label: 'Frame sequential' }
        ]
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; fmt: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { fmt: o.fmt }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.STEREO_FMT, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}
