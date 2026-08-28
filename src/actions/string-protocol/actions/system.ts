import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { DeviceProtocolEnum } from '../../../types'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, openCloseField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

/**
 * System / frame rate / OSD / low-power actions:
 *  - osd        (§5.4.10)   Text / image / video OSD switch
 *  - framerate  (§5.4.11)   Screen group frame rate multiplier
 *  - fps_adapt  (§5.4.11.3) FPS adaptive switch (B protocol only)
 *  - low_pwr    (§5.4.7)    Low-power energy saving mode (B protocol only)
 */

export function setupSystemActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- osd ----
  actions[ACTION_ID.OSD] = {
    name: 'OSD Switch',
    description: 'Set the OSD state.',
    options: [
      ...deviceAndBroadcastFields(),
      openCloseField(1),
      {
        type: 'dropdown',
        label: 'OSD type',
        id: 'type',
        default: 2,
        choices: [
          { id: 2, label: 'Video OSD' },
          { id: 4, label: 'Image OSD' },
          { id: 5, label: 'Subtitle OSD' }
        ]
      },
      {
        type: 'number',
        label: 'OSD ID',
        tooltip: 'Used for non-video OSD types.',
        id: 'osdId',
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        default: 0,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        openStatus: 0 | 1
        type: number
        osdId: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus, type: o.type, osdId: o.osdId }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.OSD, 'set', sid, data)
    }
  }

  // ---- framerate ----
  actions[ACTION_ID.FRAMERATE] = {
    name: 'Screen Group Frame Rate Multiplicaion',
    description: 'Set the screen group frame rate multiplication mode.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Mode',
        id: 'mode',
        default: 1,
        choices: [
          { id: 0, label: 'Off' },
          { id: 1, label: 'Auto' },
          { id: 2, label: 'Fixed' },
          { id: 3, label: 'Scene fusion' },
          { id: 4, label: '3D' }
        ]
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; mode: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { mode: o.mode }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.FRAMERATE, 'set', sid, data)
    }
  }

  // ---- fps_adapt ----
  host.ctx.config.protocol === DeviceProtocolEnum.B &&
    (actions[ACTION_ID.FPS_ADAPT] = {
      name: 'Frame Rate Adaptation',
      description: 'Enable or disable frame rate adaptation for the specified screen group.',
      options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
      callback: async (event) => {
        const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
        const sid = sidFromOptions(o.isSelectAll, o.deviceId)
        const data: Record<string, unknown> = { en: o.openStatus }
        if (typeof o.gid === 'number') data.gid = o.gid
        await conn.sendOnly(CMD.FPS_ADAPT, 'set', sid, data)
      }
    })

  // ---- low_pwr ----
  host.ctx.config.protocol === DeviceProtocolEnum.B &&
    (actions[ACTION_ID.LOW_PWR] = {
      name: 'Low Power Mode',
      description: 'Enable or disable the low-power energy saving mode.',
      options: [...deviceAndBroadcastFields(), openCloseField(0)],
      callback: async (event) => {
        const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
        const sid = sidFromOptions(o.isSelectAll, o.deviceId)
        const data: Record<string, unknown> = { en: o.openStatus }
        await conn.sendOnly(CMD.LOW_PWR, 'set', sid, data)
      }
    })

  return actions as CompanionActionDefinitions
}
