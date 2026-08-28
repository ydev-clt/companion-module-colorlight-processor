import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, openCloseField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

/**
 * Color / gain actions:
 *  - colorspace (§5.2.12)
 *  - prec_mgr   (§5.2.34)
 *  - ct_r/ct_g/ct_b (§5.2.35/36/37)
 *  - grp_gain   (§5.2.33)
 *  - virtual_pixel (§5.2.45)
 */

export function setupColorActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- colorspace ----
  actions[ACTION_ID.COLORSPACE] = {
    name: 'Set Output Color Space',
    description: 'Set the output color space.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Color space',
        id: 'space',
        default: 6,
        choices: [
          { id: 0, label: 'Keep native gamut' },
          { id: 1, label: 'sRGB' },
          { id: 2, label: 'Adobe RGB' },
          { id: 3, label: 'PAL' },
          { id: 4, label: 'NTSC' },
          { id: 5, label: 'Rec.601' },
          { id: 6, label: 'Rec.709' },
          { id: 7, label: 'Rec.2020' },
          { id: 8, label: 'DCI-P3' }
        ]
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; space: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { space: o.space }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.COLORSPACE, 'set', sid, data)
    }
  }

  // ---- prec_mgr ----
  actions[ACTION_ID.PREC_MGR] = {
    name: 'Precise Color Manager',
    description: 'Enable or disable precise color management.',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.PREC_MGR, 'set', sid, data)
    }
  }

  // ---- ct_r ----
  actions[ACTION_ID.CT_R] = {
    name: 'Color Temp Red Gain',
    description: 'Set the red component of the screen group color temperature.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'R gain (0-10000)', id: 'r', min: 0, max: 10000, default: 0, required: true },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; r: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { r: o.r }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.CT_R, 'set', sid, data)
    }
  }

  // ---- ct_g ----
  actions[ACTION_ID.CT_G] = {
    name: 'Color Temp Green Gain',
    description: 'Set the green component of the screen group color temperature.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'G gain (0-10000)', id: 'g', min: 0, max: 10000, default: 0, required: true },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; g: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { g: o.g }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.CT_G, 'set', sid, data)
    }
  }

  // ---- ct_b ----
  actions[ACTION_ID.CT_B] = {
    name: 'Color Temp Blue Gain',
    description: 'Set the blue component of the screen group color temperature.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'B gain (0-10000)', id: 'b', min: 0, max: 10000, default: 0, required: true },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; b: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { b: o.b }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.CT_B, 'set', sid, data)
    }
  }

  // ---- grp_gain ----
  actions[ACTION_ID.GRP_GAIN] = {
    name: 'Screen Group Intensity Gain',
    description: 'Set the screen group intensity gain.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'Gain (0-10000)', id: 'gain', min: 0, max: 10000, default: 0, required: true },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; gain: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { gain: o.gain }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.GRP_GAIN, 'set', sid, data)
    }
  }

  // ---- virtual_pixel ----
  actions[ACTION_ID.VIRTUAL_PIXEL] = {
    name: 'Virtual Pixel Switch',
    description: 'Enable or disable virtual pixel.',
    options: [
      ...deviceAndBroadcastFields(),
      openCloseField(1),
      {
        type: 'dropdown',
        label: 'Scale Factor',
        id: 'rate',
        default: 1,
        choices: [
          {
            id: 1,
            label: '4x virtual'
          },
          {
            id: 2,
            label: '3x virtual'
          },
          {
            id: 3,
            label: '0.75 virtual'
          }
        ],
        isVisible: (options) => options.openStatus === 1
      },
      {
        type: 'dropdown',
        label: 'Pixel Arrangement',
        id: 'direction',
        default: 0,
        choices: [
          {
            id: 0,
            label: 'Left to right'
          },
          {
            id: 1,
            label: 'Top to bottom'
          }
        ],
        isVisible: (options) => options.openStatus === 1
      },
      {
        type: 'checkbox',
        label: 'Row Offset',
        id: 'rowOffset',
        default: false,
        isVisible: (options) => options.openStatus === 1
      },
      {
        type: 'checkbox',
        label: 'Col Offset',
        id: 'colOffset',
        default: false,
        isVisible: (options) => options.openStatus === 1
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        openStatus: 0 | 1
        rate: number
        direction: number
        rowOffset: number
        colOffset: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (o.openStatus) {
        const { rate, direction, rowOffset, colOffset } = o
        Object.assign(data, {
          rate,
          direction,
          rowOffset: rowOffset ? 1 : 0,
          colOffset: colOffset ? 1 : 0
        })
      }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.VIRTUAL_PIXEL, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}
