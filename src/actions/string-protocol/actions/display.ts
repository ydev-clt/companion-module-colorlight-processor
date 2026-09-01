import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, openCloseField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

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
 */

export function setupDisplayActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- bright (brightness) ----
  actions[ACTION_ID.BRIGHT] = {
    name: 'Set Brightness',
    description: 'Set the sender brightness.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Brightness',
        id: 'brightness',
        min: 0,
        max: 10000,
        tooltip: 'Brightness level, range 0-10000.',
        default: 10000,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        brightness: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const brt = Math.round(Math.max(0, Math.min(10000, o.brightness)))
      const data: Record<string, unknown> = { brt }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.BRIGHT, 'set', sid, data)
    }
  }

  // ---- colortemp (color temperature) ----
  actions[ACTION_ID.COLORTEMP] = {
    name: 'Set Color Temperature',
    description: 'Set the sender color temperature.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Color Temperature',
        tooltip: 'Color temperature in Kelvin, range 2000-10000.',
        id: 'ct',
        min: 2000,
        max: 10000,
        default: 6500,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; ct: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { ct: o.ct }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.COLORTEMP, 'set', sid, data)
    }
  }

  // ---- freeze ----
  actions[ACTION_ID.FREEZE_SCREEN] = {
    name: 'Open/Close Freeze Screen',
    description: 'Freeze the output (set en=1) or unfreeze (en=0).',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid

      await conn.sendAndAwait(CMD.FREEZE, 'set', sid, data)
      // After the set, wait for the get response (used to write back state)
      const resp = await conn.sendAndAwait<{ gid?: number }, { en: number }>(CMD.FREEZE, 'get', sid, { gid: o.gid })
      if (resp && resp.code === 0 && resp.data) {
        host.ctx.state.isFreezeScreen = resp.data.en === 1
      }
    }
  }

  // ---- blackout ----
  actions[ACTION_ID.BLACKOUT] = {
    name: 'Open/Close Black Screen',
    description: 'Blackout (en=1) or restore (en=0).',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendAndAwait(CMD.BLACKOUT, 'set', sid, data)

      // After the set, wait for the get response (used to write back state)
      const resp = await conn.sendAndAwait<{ gid?: number }, { en: number }>(CMD.BLACKOUT, 'get', sid, { gid: o.gid })
      if (resp && resp.code === 0 && resp.data) {
        host.ctx.state.isBlackScreen = resp.data.en === 1
      }
    }
  }

  // ---- testmode (test mode) ----
  actions[ACTION_ID.TESTMODE] = {
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

  // ---- hdrmode (HDR) ----
  actions[ACTION_ID.HDRMODE] = {
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
  actions[ACTION_ID.MUTE] = {
    name: 'Mute',
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

  // ---- fade (fade in/out) ----
  actions[ACTION_ID.FADE] = {
    name: 'Fade In/Out (en)',
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

  // ---- fadetime (fade duration) ----
  actions[ACTION_ID.FADETIME] = {
    name: 'Fade Time (ms)',
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

  // ---- zerodelay (low latency) ----
  actions[ACTION_ID.ZERODELAY] = {
    name: 'Zero Delay',
    description: 'Zero-delay switch & mode.',
    options: [
      ...deviceAndBroadcastFields(),
      openCloseField(0),
      {
        type: 'dropdown',
        label: 'Delay mode',
        id: 'mode',
        tooltip: 'Delay mode: 0-frame delay / 1-frame delay',
        default: 1,
        choices: [
          { id: 1, label: '0-frame' },
          { id: 2, label: '1-frame' }
        ]
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

  // ---- uh5_st (UH5 status) ----
  actions[ACTION_ID.UH5_ST] = {
    name: 'Set UH5 Status',
    description: 'Set the UH5 status.',
    options: [...deviceAndBroadcastFields(), openCloseField(1)],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1 }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      await conn.sendOnly(CMD.UH5_ST, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}
