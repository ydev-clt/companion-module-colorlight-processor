import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { logger } from '../../../common/log'
import { isCmdOpSupported, type DeviceIdentity } from '../../../common/cmd-support'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import {
  deviceAndBroadcastFields,
  deviceIdentity,
  finiteNumber,
  gidData,
  gidField,
  openCloseField,
  requestGid,
  sidFromOptions,
  withGid
} from './_shared'
import type { StringActionHost } from './_shared'

/**
 * Color / gain actions:
 *  - colorspace (§5.2.12)
 *  - prec_mgr   (§5.2.34)
 *  - ct_r/ct_g/ct_b (§5.2.35/36/37)
 *  - grp_gain   (§5.2.33)
 *  - virtual_pixel (§5.2.45)
 *
 * Red, green, and blue gain use percent × 100, so 100% is 10000 and a 1% step is 100.
 */

interface CtChannel {
  id: (typeof ACTION_ID)[keyof typeof ACTION_ID]
  cmd: string
  field: string
  stepField: string
  letter: 'R' | 'G' | 'B'
  colorName: 'Red' | 'Green' | 'Blue'
  name: string
  description: string
}

const CT_CHANNELS: readonly CtChannel[] = [
  {
    id: ACTION_ID.CT_R_SET,
    cmd: CMD.CT_R,
    field: 'r',
    stepField: 'rStep',
    letter: 'R',
    colorName: 'Red',
    name: 'Set Color Temp Red Gain',
    description: 'Set the red component of the screen group color temperature.'
  },
  {
    id: ACTION_ID.CT_G_SET,
    cmd: CMD.CT_G,
    field: 'g',
    stepField: 'gStep',
    letter: 'G',
    colorName: 'Green',
    name: 'Set Color Temp Green Gain',
    description: 'Set the green component of the screen group color temperature.'
  },
  {
    id: ACTION_ID.CT_B_SET,
    cmd: CMD.CT_B,
    field: 'b',
    stepField: 'bStep',
    letter: 'B',
    colorName: 'Blue',
    name: 'Set Color Temp Blue Gain',
    description: 'Set the blue component of the screen group color temperature.'
  }
]

function makeCtGainAction(
  conn: StringActionHost['conn'],
  identity: DeviceIdentity,
  channel: CtChannel
): CompanionActionDefinition {
  return {
    name: channel.name,
    description: channel.description,
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
        label: `${channel.letter} gain (%)`,
        id: channel.field,
        min: 0,
        max: 100,
        default: 0,
        isVisibleExpression: '$(options:operation) != "step"'
      },
      {
        type: 'number',
        label: `${channel.letter} gain step (%)`,
        tooltip: 'Positive values increase gain; negative values decrease it.',
        id: channel.stepField,
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
        gid?: number
        [key: string]: unknown
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const requestData = requestGid(o.gid)

      let value: number
      if (o.operation === 'step') {
        if (!isCmdOpSupported(channel.cmd, 'get', identity)) {
          logger.warn(`${channel.colorName}-gain step skipped: GET ${channel.cmd} is not supported on this device.`)
          return
        }
        const resp = await conn.sendAndAwait<unknown, Record<string, unknown>>(
          channel.cmd,
          'get',
          sid,
          requestData
        )
        const rawCurrent = resp?.data?.[channel.field]
        const current = finiteNumber(rawCurrent)
        if (!resp || resp.code !== 0 || current === undefined) {
          logger.warn(
            `${channel.colorName}-gain step skipped: GET ${channel.cmd} did not return a valid ${channel.field} value.`
          )
          return
        }
        const step = Math.round(Math.max(-100, Math.min(100, Number(o[channel.stepField])))) * 100
        value = Math.round(Math.max(0, Math.min(10000, current + step)))
      } else {
        const raw = Number(o[channel.field])
        if (!Number.isFinite(raw)) {
          logger.warn(`Set ${channel.cmd} skipped: field ${channel.field} must be a finite number.`)
          return
        }
        value = Math.round(Math.max(0, Math.min(100, raw))) * 100
      }

      const data: Record<string, unknown> = { [channel.field]: value }
      withGid(o.gid, data)
      await conn.sendOnly(channel.cmd, 'set', sid, data)
    }
  }
}

export function setupColorActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const identity = deviceIdentity(host)
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
      await conn.sendOnly(CMD.COLORSPACE, 'set', sid, withGid(o.gid, { space: o.space }))
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
      await conn.sendOnly(CMD.PREC_MGR, 'set', sid, withGid(o.gid, { en: o.enableStatus }))
    }
  }

  for (const channel of CT_CHANNELS) {
    actions[channel.id] = makeCtGainAction(conn, identity, channel)
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
      await conn.sendOnly(CMD.GRP_GAIN, 'set', sid, withGid(o.gid, { gain: o.gain }))
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
        rowOffset: boolean
        colOffset: boolean
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const gid = gidData(o.gid)
      if (!o.enableStatus) {
        await conn.sendOnly(CMD.VIRTUAL_PIXEL, 'set', sid, { en: o.enableStatus, ...gid })
        return
      }

      // Offsets are applied only after the enable call finishes.
      const enabled = await conn.sendOnly(CMD.VIRTUAL_PIXEL, 'set', sid, {
        en: o.enableStatus,
        rate: o.rate,
        direction: o.direction,
        ...gid
      })
      if (!enabled) return
      await conn.sendOnly(CMD.VIRTUAL_PIXEL, 'set', sid, {
        rowOffset: o.rowOffset ? 1 : 0,
        colOffset: o.colOffset ? 1 : 0,
        ...gid
      })
    }
  }

  return actions as CompanionActionDefinitions
}
