import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { logger } from '../../../log'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { buildGetAction, deviceAndBroadcastFields, gidField, openCloseField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'
import { DeviceProtocolEnum } from '../../../types'

/**
 * Display / picture actions:
 *  - brightness     bright   (§5.2.1)
 *  - color temp     colortemp (§5.2.2)
 *  - freeze         freeze   (§5.2.3)
 *  - blackout       blackout (§5.2.4)
 *  - test mode      testmode (§5.2.39)
 *  - HDR mode       hdrmode  (§5.2.7)
 *  - mute           mute     (§5.2.44)
 *  - fade in/out    fade / fadetime (§5.2.29 §5.2.30)
 *  - zero delay     zerodelay (§5.2.32)
 *  - UH5 status     uh5_st   (§5.2.38, A protocol only)
 *
 * Each set+get cmd has two actions: `<cmd>_set` (write) and `<cmd>_get`
 * (read & update variables). The split keeps set latency predictable
 * and lets users poll/refresh independently.
 */

export function setupDisplayActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- bright (brightness) ----
  actions[ACTION_ID.BRIGHT_SET] = {
    name: 'Set Brightness',
    description: 'Set the sender brightness.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Operation',
        id: 'operation',
        default: 'set',
        choices: [
          { id: 'set', label: 'Set percentage' },
          { id: 'step', label: 'Adjust by signed step' }
        ]
      },
      {
        type: 'number',
        label: 'Brightness (%)',
        id: 'brightness',
        min: 0,
        max: 100,
        default: 100,
        required: true,
        isVisible: (options) => options.operation !== 'step'
      },
      {
        type: 'number',
        label: 'Brightness step (%)',
        tooltip: 'Positive values increase brightness; negative values decrease it.',
        id: 'brightnessStep',
        min: -100,
        max: 100,
        default: 0,
        required: true,
        isVisible: (options) => options.operation === 'step'
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        operation?: 'set' | 'step'
        brightness: number
        brightnessStep: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const requestData = typeof o.gid === 'number' ? { gid: o.gid } : undefined

      let brt: number
      if (o.operation === 'step') {
        const resp = await conn.sendAndAwait<unknown, { brt?: unknown }>(CMD.BRIGHT, 'get', sid, requestData)
        const rawCurrent = resp?.data?.brt
        const current = Number(rawCurrent)
        if (!resp || resp.code !== 0 || rawCurrent === undefined || rawCurrent === null || !Number.isFinite(current)) {
          logger.warn('Brightness step skipped: GET bright did not return a valid brt value.')
          return
        }
        const stepPercent = Math.round(Math.max(-100, Math.min(100, Number(o.brightnessStep))))
        brt = Math.round(Math.max(0, Math.min(10000, current + stepPercent * 100)))
      } else {
        const rawPercentage = Number(o.brightness)
        if (!Number.isFinite(rawPercentage)) {
          logger.warn('Set bright skipped: field brightness must be a finite number.')
          return
        }
        const percentage = Math.round(Math.max(0, Math.min(100, rawPercentage)))
        brt = percentage * 100
      }

      const data: Record<string, unknown> = { brt }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.BRIGHT, 'set', sid, data)
    }
  }
  actions[ACTION_ID.BRIGHT_GET] = buildGetAction(host, {
    name: 'Get Brightness',
    description: 'Query the sender brightness and write to the `brightness` variable.',
    cmd: CMD.BRIGHT,
    dataBuilder: ({ gid }) => (typeof gid === 'number' ? { gid } : undefined)
  })

  // ---- colortemp ----
  actions[ACTION_ID.COLORTEMP_SET] = {
    name: 'Set Color Temperature',
    description: 'Set the sender color temperature.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Operation',
        id: 'operation',
        default: 'set',
        choices: [
          { id: 'set', label: 'Set value' },
          { id: 'step', label: 'Adjust by signed step' }
        ]
      },
      {
        type: 'number',
        label: 'Color Temperature (K)',
        id: 'ct',
        min: 2000,
        max: 10000,
        default: 6500,
        required: true,
        isVisible: (options) => options.operation !== 'step'
      },
      {
        type: 'number',
        label: 'Color Temperature step (K)',
        tooltip: 'Positive values increase color temperature; negative values decrease it.',
        id: 'ctStep',
        min: -8000,
        max: 8000,
        default: 0,
        required: true,
        isVisible: (options) => options.operation === 'step'
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        operation?: 'set' | 'step'
        ct: number
        ctStep: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const requestData = typeof o.gid === 'number' ? { gid: o.gid } : undefined

      let ct: number
      if (o.operation === 'step') {
        const resp = await conn.sendAndAwait<unknown, { ct?: unknown }>(CMD.COLORTEMP, 'get', sid, requestData)
        const rawCurrent = resp?.data?.ct
        const current = Number(rawCurrent)
        if (!resp || resp.code !== 0 || rawCurrent === undefined || rawCurrent === null || !Number.isFinite(current)) {
          logger.warn('Color-temperature step skipped: GET colortemp did not return a valid ct value.')
          return
        }
        const step = Math.round(Math.max(-8000, Math.min(8000, Number(o.ctStep))))
        ct = Math.round(Math.max(2000, Math.min(10000, current + step)))
      } else {
        const rawCt = Number(o.ct)
        if (!Number.isFinite(rawCt)) {
          logger.warn('Set colortemp skipped: field ct must be a finite number.')
          return
        }
        ct = Math.round(Math.max(2000, Math.min(10000, rawCt)))
      }

      const data: Record<string, unknown> = { ct }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.COLORTEMP, 'set', sid, data)
    }
  }
  actions[ACTION_ID.COLORTEMP_GET] = buildGetAction(host, {
    name: 'Get Color Temperature',
    description: 'Query the sender color temperature and write to the `color_temperature` variable.',
    cmd: CMD.COLORTEMP,
    dataBuilder: ({ gid }) => (typeof gid === 'number' ? { gid } : undefined)
  })

  // ---- freeze ----
  actions[ACTION_ID.FREEZE_SCREEN_SET] = {
    name: 'Set Freeze Screen',
    description: 'Freeze the output (en=1) or unfreeze (en=0).',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.FREEZE, 'set', sid, data)
    }
  }
  actions[ACTION_ID.FREEZE_SCREEN_GET] = buildGetAction<{ deviceId: number; isSelectAll: boolean; gid?: number }>(
    host,
    {
      name: 'Get Freeze Screen Status',
      description:
        'Query the freeze status and update the `freeze_enable` variable (0: off, 1: freeze). Also updates the freeze feedback via state.',
      cmd: CMD.FREEZE,
      dataBuilder: ({ gid }) => (typeof gid === 'number' ? { gid } : undefined),
      afterResponse: (resp) => {
        // host.ctx.checkFeedbacks(FEEDBACK_ID.FREEZE_SCREEN)
        const data = resp.data as { en?: number } | undefined
        logger.info(`Freeze screen state changed: ${data?.en}`)
      }
    }
  )

  // ---- blackout ----
  actions[ACTION_ID.BLACKOUT_SET] = {
    name: 'Set Black Screen',
    description: 'Blackout (en=1) or restore (en=0).',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.BLACKOUT, 'set', sid, data)
    }
  }
  actions[ACTION_ID.BLACKOUT_GET] = buildGetAction<{ deviceId: number; isSelectAll: boolean; gid?: number }>(host, {
    name: 'Get Black Screen Status',
    description:
      'Query the blackout status and update the `blackout_enable` variable (0: off, 1: blackout). Also updates the blackout feedback via state.',
    cmd: CMD.BLACKOUT,
    dataBuilder: ({ gid }) => (typeof gid === 'number' ? { gid } : undefined),
    afterResponse: (resp) => {
      // host.ctx.checkFeedbacks(FEEDBACK_ID.BLACKOUT)
      const data = resp.data as { en?: number } | undefined
      logger.info(`Black screen state changed: ${data?.en}`)
    }
  })

  // ---- testmode ----
  actions[ACTION_ID.TESTMODE_SET] = {
    name: 'Set Test Pattern',
    description: 'Set the test Pattern.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Test index',
        id: 'tp',
        tooltip: 'Test pattern index; 0 = off, other values = built-in test pattern number.',
        default: 0,
        min: 0,
        max: Number.MAX_SAFE_INTEGER
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; tp: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { tp: o.tp }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.TESTMODE, 'set', sid, data)
    }
  }
  actions[ACTION_ID.TESTMODE_GET] = buildGetAction(host, {
    name: 'Get Test Pattern',
    description:
      'Query the active test pattern and write to the `testmode_pattern` variable (0: off, other: built-in test pattern index).',
    cmd: CMD.TESTMODE,
    dataBuilder: ({ gid }) => (typeof gid === 'number' ? { gid } : undefined)
  })

  // ---- hdrmode ----
  actions[ACTION_ID.HDRMODE_SET] = {
    name: 'Set HDR Mode',
    description: 'Set the HDR mode.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'HDR mode',
        id: 'mode',
        default: 0,
        choices: [
          { id: 0, label: 'Off' },
          { id: 1, label: 'Auto' },
          { id: 2, label: 'Force HDR10 (Rec.2020)' },
          { id: 3, label: 'Force HDR10 (DCI-P3)' },
          { id: 4, label: 'Force HDR10 (Rec.709)' },
          { id: 5, label: 'Force HLG (Rec.2020)' },
          { id: 6, label: 'Force HLG (DCI-P3)' },
          { id: 7, label: 'Force HLG (Rec.709)' }
        ]
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; mode: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { mode: o.mode }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.HDRMODE, 'set', sid, data)
    }
  }
  actions[ACTION_ID.HDRMODE_GET] = buildGetAction(host, {
    name: 'Get HDR Mode',
    description:
      'Query the current HDR mode and write to the `hdrmode` variable (0: off, 1: auto, 2: HDR10 Rec.2020, 3: HDR10 DCI-P3, 4: HDR10 Rec.709, 5: HLG Rec.2020, 6: HLG DCI-P3, 7: HLG Rec.709).',
    cmd: CMD.HDRMODE,
    dataBuilder: ({ gid }) => (typeof gid === 'number' ? { gid } : undefined)
  })

  // ---- mute ----
  actions[ACTION_ID.MUTE_SET] = {
    name: 'Set Mute',
    description: 'Set mute on or off.',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.MUTE, 'set', sid, data)
    }
  }
  actions[ACTION_ID.MUTE_GET] = buildGetAction(host, {
    name: 'Get Mute Status',
    description: 'Query the mute state and write to the `mute_enable` variable (0: off, 1: muted).',
    cmd: CMD.MUTE,
    dataBuilder: ({ gid }) => (typeof gid === 'number' ? { gid } : undefined)
  })

  // ---- fade ----
  actions[ACTION_ID.FADE_SET] = {
    name: 'Set Fade In/Out',
    description: 'Enable or disable fade in/out.',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.FADE, 'set', sid, data)
    }
  }
  actions[ACTION_ID.FADE_GET] = buildGetAction(host, {
    name: 'Get Fade In/Out Status',
    description: 'Query the fade in/out state and write to the `fade_enable` variable (0: off, 1: on).',
    cmd: CMD.FADE,
    dataBuilder: ({ gid }) => (typeof gid === 'number' ? { gid } : undefined)
  })

  // ---- fadetime ----
  actions[ACTION_ID.FADETIME_SET] = {
    name: 'Set Fade Time',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Fade time (ms)',
        id: 'ms',
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        default: 0,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; ms: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { ms: o.ms }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.FADETIME, 'set', sid, data)
    }
  }
  actions[ACTION_ID.FADETIME_GET] = buildGetAction(host, {
    name: 'Get Fade Time',
    description: 'Query the fade time and write to the `fadetime_ms` variable.',
    cmd: CMD.FADETIME,
    dataBuilder: ({ gid }) => (typeof gid === 'number' ? { gid } : undefined)
  })

  // ---- zerodelay ----
  // A protocol only supports mode=1 (0-frame); B protocol also supports mode=2 (1-frame).
  const zerodelayModeChoices: Array<{ id: 1 | 2; label: string }> = [{ id: 1, label: '0-frame' }]
  if (host.ctx.config.protocol === DeviceProtocolEnum.B) {
    zerodelayModeChoices.push({ id: 2, label: '1-frame' })
  }

  actions[ACTION_ID.ZERODELAY_SET] = {
    name: 'Set Zero Delay',
    description: 'Zero-delay switch & mode.',
    options: [
      ...deviceAndBroadcastFields(),
      openCloseField(0),
      {
        type: 'dropdown',
        label: 'Delay mode',
        id: 'mode',
        tooltip:
          host.ctx.config.protocol === DeviceProtocolEnum.A
            ? 'Delay mode: 0-frame delay (A protocol only supports 0-frame)'
            : 'Delay mode: 0-frame delay / 1-frame delay',
        default: 1,
        choices: zerodelayModeChoices
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        openStatus: 0 | 1
        mode: 1 | 2
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus, mode: o.mode }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.ZERODELAY, 'set', sid, data)
    }
  }
  actions[ACTION_ID.ZERODELAY_GET] = buildGetAction(host, {
    name: 'Get Zero Delay',
    description:
      'Query the zero-delay state and mode. Writes the result to the `zerodelay` variable as a single object: `{ enable, mode }` — enable (0: off, 1: on); mode (1: 0-frame, 2: 1-frame).',
    cmd: CMD.ZERODELAY,
    dataBuilder: ({ gid }) => (typeof gid === 'number' ? { gid } : undefined)
  })

  // ---- uh5_st ----
  actions[ACTION_ID.UH5_ST_SET] = {
    name: 'Set UH5 Status',
    description: 'Set the UH5 status (A protocol only).',
    options: [...deviceAndBroadcastFields(), openCloseField(1)],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1 }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      await conn.sendOnly(CMD.UH5_ST, 'set', sid, data)
    }
  }
  actions[ACTION_ID.UH5_ST_GET] = buildGetAction(host, {
    name: 'Get UH5 Status',
    description: 'Query the UH5 status and write to the `uh5_enable` variable (0: off, 1: on) (A protocol only).',
    cmd: CMD.UH5_ST,
    skipGid: true
  })

  return actions as CompanionActionDefinitions
}
