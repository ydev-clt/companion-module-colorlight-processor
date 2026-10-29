import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { logger } from '../../../log'
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
  actions[ACTION_ID.COLORSPACE_SET] = {
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
  actions[ACTION_ID.PREC_MGR_SET] = {
    name: 'Set Precise Color Manager',
    description: 'Enable or disable precise color management.',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; enableStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.enableStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.PREC_MGR, 'set', sid, data)
    }
  }

  // ---- ct_r ----
  actions[ACTION_ID.CT_R_SET] = {
    name: 'Set Color Temp Red Gain',
    description: 'Set the red component of the screen group color temperature.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Operation',
        id: 'operation',
        disableAutoExpression: true,
        default: 'set',
        choices: [
          { id: 'set', label: 'Set percentage' },
          { id: 'step', label: 'Adjust by signed step' }
        ]
      },
      {
        type: 'number',
        label: 'R gain (%)',
        id: 'r',
        min: 0,
        max: 100,
        default: 0,
        isVisibleExpression: '$(options:operation) != "step"'
      },
      {
        type: 'number',
        label: 'R gain step (%)',
        tooltip: 'Positive values increase gain; negative values decrease it.',
        id: 'rStep',
        min: -100,
        max: 100,
        default: 0,
        isVisibleExpression: '$(options:operation) == "step"'
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        operation?: 'set' | 'step'
        r: number
        rStep: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const requestData = typeof o.gid === 'number' ? { gid: o.gid } : undefined

      let r: number
      if (o.operation === 'step') {
        const resp = await conn.sendAndAwait<unknown, { r?: unknown }>(CMD.CT_R, 'get', sid, requestData)
        const rawCurrent = resp?.data?.r
        const current = Number(rawCurrent)
        if (!resp || resp.code !== 0 || rawCurrent === undefined || rawCurrent === null || !Number.isFinite(current)) {
          logger.warn('Red-gain step skipped: GET ct_r did not return a valid r value.')
          return
        }
        const step = Math.round(Math.max(-100, Math.min(100, Number(o.rStep)))) * 100
        r = Math.round(Math.max(0, Math.min(10000, current + step)))
      } else {
        const rawR = Number(o.r)
        if (!Number.isFinite(rawR)) {
          logger.warn('Set ct_r skipped: field r must be a finite number.')
          return
        }
        r = Math.round(Math.max(0, Math.min(100, rawR))) * 100
      }

      const data: Record<string, unknown> = { r }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.CT_R, 'set', sid, data)
    }
  }

  // ---- ct_g ----
  actions[ACTION_ID.CT_G_SET] = {
    name: 'Set Color Temp Green Gain',
    description: 'Set the green component of the screen group color temperature.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Operation',
        id: 'operation',
        disableAutoExpression: true,
        default: 'set',
        choices: [
          { id: 'set', label: 'Set percentage' },
          { id: 'step', label: 'Adjust by signed step' }
        ]
      },
      {
        type: 'number',
        label: 'G gain (%)',
        id: 'g',
        min: 0,
        max: 100,
        default: 0,
        isVisibleExpression: '$(options:operation) != "step"'
      },
      {
        type: 'number',
        label: 'G gain step (%)',
        tooltip: 'Positive values increase gain; negative values decrease it.',
        id: 'gStep',
        min: -100,
        max: 100,
        default: 0,
        isVisibleExpression: '$(options:operation) == "step"'
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        operation?: 'set' | 'step'
        g: number
        gStep: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const requestData = typeof o.gid === 'number' ? { gid: o.gid } : undefined

      let g: number
      if (o.operation === 'step') {
        const resp = await conn.sendAndAwait<unknown, { g?: unknown }>(CMD.CT_G, 'get', sid, requestData)
        const rawCurrent = resp?.data?.g
        const current = Number(rawCurrent)
        if (!resp || resp.code !== 0 || rawCurrent === undefined || rawCurrent === null || !Number.isFinite(current)) {
          logger.warn('Green-gain step skipped: GET ct_g did not return a valid g value.')
          return
        }
        const step = Math.round(Math.max(-100, Math.min(100, Number(o.gStep)))) * 100
        g = Math.round(Math.max(0, Math.min(10000, current + step)))
      } else {
        const rawG = Number(o.g)
        if (!Number.isFinite(rawG)) {
          logger.warn('Set ct_g skipped: field g must be a finite number.')
          return
        }
        g = Math.round(Math.max(0, Math.min(100, rawG))) * 100
      }

      const data: Record<string, unknown> = { g }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.CT_G, 'set', sid, data)
    }
  }

  // ---- ct_b ----
  actions[ACTION_ID.CT_B_SET] = {
    name: 'Set Color Temp Blue Gain',
    description: 'Set the blue component of the screen group color temperature.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Operation',
        id: 'operation',
        disableAutoExpression: true,
        default: 'set',
        choices: [
          { id: 'set', label: 'Set percentage' },
          { id: 'step', label: 'Adjust by signed step' }
        ]
      },
      {
        type: 'number',
        label: 'B gain (%)',
        id: 'b',
        min: 0,
        max: 100,
        default: 0,
        isVisibleExpression: '$(options:operation) != "step"'
      },
      {
        type: 'number',
        label: 'B gain step (%)',
        tooltip: 'Positive values increase gain; negative values decrease it.',
        id: 'bStep',
        min: -100,
        max: 100,
        default: 0,
        isVisibleExpression: '$(options:operation) == "step"'
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        operation?: 'set' | 'step'
        b: number
        bStep: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const requestData = typeof o.gid === 'number' ? { gid: o.gid } : undefined

      let b: number
      if (o.operation === 'step') {
        const resp = await conn.sendAndAwait<unknown, { b?: unknown }>(CMD.CT_B, 'get', sid, requestData)
        const rawCurrent = resp?.data?.b
        const current = Number(rawCurrent)
        if (!resp || resp.code !== 0 || rawCurrent === undefined || rawCurrent === null || !Number.isFinite(current)) {
          logger.warn('Blue-gain step skipped: GET ct_b did not return a valid b value.')
          return
        }
        const step = Math.round(Math.max(-100, Math.min(100, Number(o.bStep)))) * 100
        b = Math.round(Math.max(0, Math.min(10000, current + step)))
      } else {
        const rawB = Number(o.b)
        if (!Number.isFinite(rawB)) {
          logger.warn('Set ct_b skipped: field b must be a finite number.')
          return
        }
        b = Math.round(Math.max(0, Math.min(100, rawB))) * 100
      }

      const data: Record<string, unknown> = { b }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.CT_B, 'set', sid, data)
    }
  }

  // ---- grp_gain ----
  actions[ACTION_ID.GRP_GAIN_SET] = {
    name: 'Set Screen Group Intensity Gain',
    description: 'Set the screen group intensity gain.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'Gain (0-10000)', id: 'gain', min: 0, max: 10000, default: 0 },
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
  actions[ACTION_ID.VIRTUAL_PIXEL_SET] = {
    name: 'Set Virtual Pixel',
    description: 'Enable or disable virtual pixel.',
    options: [
      ...deviceAndBroadcastFields(),
      openCloseField(1, { disableAutoExpression: true }),
      {
        type: 'dropdown',
        label: 'Scale Factor',
        id: 'rate',
        default: 1,
        choices: [
          { id: 1, label: '4x virtual' },
          { id: 2, label: '3x virtual' },
          { id: 3, label: '0.75 virtual' }
        ],
        isVisibleExpression: '$(options:enableStatus) == 1'
      },
      {
        type: 'dropdown',
        label: 'Pixel Arrangement',
        id: 'direction',
        default: 0,
        choices: [
          { id: 0, label: 'Left to right' },
          { id: 1, label: 'Top to bottom' }
        ],
        isVisibleExpression: '$(options:enableStatus) == 1'
      },
      {
        type: 'checkbox',
        label: 'Row Offset',
        id: 'rowOffset',
        default: false,
        isVisibleExpression: '$(options:enableStatus) == 1'
      },
      {
        type: 'checkbox',
        label: 'Col Offset',
        id: 'colOffset',
        default: false,
        isVisibleExpression: '$(options:enableStatus) == 1'
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        enableStatus: 0 | 1
        rate: number
        direction: number
        rowOffset: number
        colOffset: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.enableStatus }
      if (o.enableStatus) {
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
