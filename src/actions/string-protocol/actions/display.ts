import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { logger } from '../../../common/log'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import {
  deviceAndBroadcastFields,
  gidField,
  openCloseField,
  openCloseToggleField,
  sidFromOptions
} from './_shared'
import type { StringActionHost } from './_shared'
import { DeviceProtocolEnum } from '../../../common/types'
import { isCmdOpSupported, type DeviceIdentity } from '../../../common/cmd-support'

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
 * Brightness step, color-temperature step, and freeze/blackout toggle
 * read the current value with a protocol get before writing. Those reads
 * do not publish variables.
 */

async function sendOpenCloseOrToggle(
  conn: StringActionHost['conn'],
  identity: DeviceIdentity,
  cmd: string,
  featureName: 'Freeze' | 'Blackout',
  options: { deviceId: number; isSelectAll: boolean; enableStatus: number; gid?: number }
): Promise<void> {
  const sid = sidFromOptions(options.isSelectAll, options.deviceId)
  const data: Record<string, unknown> = {}
  if (typeof options.gid === 'number') data.gid = options.gid

  if (options.enableStatus !== 2) {
    data.en = options.enableStatus
    await conn.sendOnly(cmd, 'set', sid, data)
    return
  }

  if (!isCmdOpSupported(cmd, 'get', identity)) {
    logger.warn(`${featureName} skipped: GET ${cmd} is not supported on this device.`)
    return
  }

  const requestData = typeof options.gid === 'number' ? { gid: options.gid } : undefined
  const resp = await conn.sendAndAwait<unknown, { en?: unknown }>(cmd, 'get', sid, requestData)
  const rawEn = resp?.data?.en
  const current = Number(rawEn)
  if (!resp || resp.code !== 0 || rawEn === undefined || rawEn === null || (current !== 0 && current !== 1)) {
    logger.warn(`${featureName} toggle skipped: GET ${cmd} did not return a valid en value.`)
    return
  }

  data.en = current === 1 ? 0 : 1
  await conn.sendOnly(cmd, 'set', sid, data)
}

export function setupDisplayActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const identity: DeviceIdentity = {
    protocol: host.ctx.config.protocol,
    modelByte: host.ctx.state.modelByte
  }
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
        disableAutoExpression: true,
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
        isVisibleExpression: '$(options:operation) != "step"'
      },
      {
        type: 'number',
        label: 'Brightness step (%)',
        tooltip: 'Positive values increase brightness; negative values decrease it.',
        id: 'brightnessStep',
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
        brightness: number
        brightnessStep: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const requestData = typeof o.gid === 'number' ? { gid: o.gid } : undefined

      let brt: number
      if (o.operation === 'step') {
        if (!isCmdOpSupported(CMD.BRIGHT, 'get', identity)) {
          logger.warn(`Brightness skipped: GET ${CMD.BRIGHT} is not supported on this device.`)
          return
        }
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
        disableAutoExpression: true,
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
        isVisibleExpression: '$(options:operation) != "step"'
      },
      {
        type: 'number',
        label: 'Color Temperature step (K)',
        tooltip: 'Positive values increase color temperature; negative values decrease it.',
        id: 'ctStep',
        min: -8000,
        max: 8000,
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
        ct: number
        ctStep: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const requestData = typeof o.gid === 'number' ? { gid: o.gid } : undefined

      let ct: number
      if (o.operation === 'step') {
        if (!isCmdOpSupported(CMD.COLORTEMP, 'get', identity)) {
          logger.warn(`Color temperature skipped: GET ${CMD.COLORTEMP} is not supported on this device.`)
          return
        }
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

  // ---- freeze ----
  actions[ACTION_ID.FREEZE_SCREEN_SET] = {
    name: 'Set Freeze Screen',
    description: 'Freeze the output (en=1), unfreeze (en=0), or toggle the current state.',
    options: [...deviceAndBroadcastFields(), openCloseToggleField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; enableStatus: number; gid?: number }
      await sendOpenCloseOrToggle(conn, identity, CMD.FREEZE, 'Freeze', o)
    }
  }

  // ---- blackout ----
  actions[ACTION_ID.BLACKOUT_SET] = {
    name: 'Set Black Screen',
    description: 'Blackout (en=1), restore (en=0), or toggle the current state.',
    options: [...deviceAndBroadcastFields(), openCloseToggleField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; enableStatus: number; gid?: number }
      await sendOpenCloseOrToggle(conn, identity, CMD.BLACKOUT, 'Blackout', o)
    }
  }

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

  // ---- mute ----
  actions[ACTION_ID.MUTE_SET] = {
    name: 'Set Mute',
    description: 'Set mute on or off.',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; enableStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.enableStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.MUTE, 'set', sid, data)
    }
  }

  // ---- fade ----
  actions[ACTION_ID.FADE_SET] = {
    name: 'Set Fade In/Out',
    description: 'Enable or disable fade in/out.',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; enableStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.enableStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.FADE, 'set', sid, data)
    }
  }

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
        default: 0
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
        enableStatus: 0 | 1
        mode: 1 | 2
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.enableStatus, mode: o.mode }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.ZERODELAY, 'set', sid, data)
    }
  }

  // ---- uh5_st ----
  actions[ACTION_ID.UH5_ST_SET] = {
    name: 'Set UH5 Status',
    description: 'Set the UH5 status (A protocol only).',
    options: [...deviceAndBroadcastFields(), openCloseField(1)],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; enableStatus: 0 | 1 }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.enableStatus }
      await conn.sendOnly(CMD.UH5_ST, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}
