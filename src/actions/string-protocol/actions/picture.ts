import type {
  CompanionActionDefinition,
  CompanionActionDefinitions,
  CompanionInputFieldNumber
} from '@companion-module/base'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, openCloseField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

/**
 * Picture adjustment actions (§5.2.5 and equivalent dedicated commands):
 *  - pic_adj (mode=0..4)
 *  - hue        (equivalent to pic_adj mode=0)
 *  - saturation (pic_adj mode=1)
 *  - contrast   (pic_adj mode=3)
 *  - brtcomp    (pic_adj mode=2)
 *
 * Note: when pic_adj and a dedicated command target the same underlying state, the last write wins.
 */

const PIC_ADJ_MODE_HELP: Record<number, { min: number; max: number; default: number; label: string; key: string }> = {
  0: { min: -30720, max: 30720, default: 0, label: 'Hue (-30720~30720)', key: 'hue' },
  1: { min: 0, max: 20000, default: 10000, label: 'Saturation (0~20000)', key: 'sat' },
  2: { min: -30, max: 30, default: 0, label: 'Brightness Compensation (-30~30)', key: 'brtcomp' },
  3: { min: 0, max: 20000, default: 10000, label: 'Contrast (0~20000)', key: 'ct' },
  4: {
    min: Number.MIN_SAFE_INTEGER,
    max: Number.MAX_SAFE_INTEGER,
    default: 0,
    label: 'Gamma (model-specific)',
    key: 'gamma'
  }
}

/**
 * PIC_ADJ (generic picture adjust) value fields:
 *
 * Companion's `CompanionInputFieldNumber.min` / `.max` are static `number`s
 * and cannot change range at runtime. The officially recommended equivalent is
 * to use `isVisible` so that each mode has its own dedicated number field inside
 * the same action, and only the field that matches the current mode is shown.
 *
 *
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const PIC_ADJ_IS_VISIBLE: Record<number, (arg: any) => boolean> = {
  0: (arg) => Number((arg?.options ?? arg)?.mode) === 0,
  1: (arg) => Number((arg?.options ?? arg)?.mode) === 1,
  2: (arg) => Number((arg?.options ?? arg)?.mode) === 2,
  3: (arg) => Number((arg?.options ?? arg)?.mode) === 3,
  4: (arg) => Number((arg?.options ?? arg)?.mode) === 4
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function buildPicAdjValueFields(): CompanionInputFieldNumber[] {
  return [0, 1, 2, 3, 4].map((mode) => {
    const spec = PIC_ADJ_MODE_HELP[mode]
    return {
      type: 'number' as const,
      label: 'Value',
      tooltip: spec.label,
      id: `val_${spec.key}`,
      min: spec.min,
      max: spec.max,
      default: spec.default,
      required: true,
      isVisible: PIC_ADJ_IS_VISIBLE[mode]
    } as CompanionInputFieldNumber
  })
}

function readPicAdjVal(opts: { mode: number; [k: string]: unknown }): number {
  const spec = PIC_ADJ_MODE_HELP[opts.mode]
  if (!spec) return 0
  return Number(opts[`val_${spec.key}`] ?? spec.default)
}

export function setupPictureActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- pic_adj generic ----
  actions[ACTION_ID.PIC_ADJ] = {
    name: 'Picture Adjust',
    description:
      'Generic picture adjustment; select the sub-channel with mode. The value range adapts to the chosen mode.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Mode',
        id: 'mode',
        default: 0,
        choices: [
          { id: 0, label: 'Hue' },
          { id: 1, label: 'Saturation' },
          { id: 2, label: 'Brightness Compensation' },
          { id: 3, label: 'Contrast' },
          { id: 4, label: 'Gamma' }
        ]
      },
      // 5 independent value fields; only the one matching the current mode is shown — achieving a "dynamic range" effect.
      ...buildPicAdjValueFields(),
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        mode: number
        gid?: number
        [k: string]: unknown
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const val = readPicAdjVal(o)
      const data: Record<string, unknown> = { mode: o.mode, val }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.PIC_ADJ, 'set', sid, data)
    }
  }

  // ---- hue (§5.2.41 / pic_adj mode=0) ----
  actions[ACTION_ID.HUE] = {
    name: 'Hue',
    description: 'Adjust the hue.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: PIC_ADJ_MODE_HELP[0].label,
        id: 'hue',
        min: PIC_ADJ_MODE_HELP[0].min,
        max: PIC_ADJ_MODE_HELP[0].max,
        default: PIC_ADJ_MODE_HELP[0].default,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; hue: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { hue: o.hue }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.GRP_HUE, 'set', sid, data)
    }
  }

  // ---- saturation (§5.2.42 / pic_adj mode=1) ----
  actions[ACTION_ID.SATURATION] = {
    name: 'Saturation',
    description: 'Adjust the saturation.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: PIC_ADJ_MODE_HELP[1].label,
        id: 'sat',
        min: PIC_ADJ_MODE_HELP[1].min,
        max: PIC_ADJ_MODE_HELP[1].max,
        default: PIC_ADJ_MODE_HELP[1].default,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; sat: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { sat: o.sat }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.GRP_SATURATION, 'set', sid, data)
    }
  }

  // ---- contrast (§5.2.43 / pic_adj mode=3) ----
  actions[ACTION_ID.CONTRAST] = {
    name: 'Contrast',
    description: 'Adjust the contrast.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: PIC_ADJ_MODE_HELP[3].label,
        id: 'con',
        min: PIC_ADJ_MODE_HELP[3].min,
        max: PIC_ADJ_MODE_HELP[3].max,
        default: PIC_ADJ_MODE_HELP[3].default,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; con: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { con: o.con }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.GRP_CONTRAST, 'set', sid, data)
    }
  }

  // ---- brtcomp (§5.2.23 / pic_adj mode=2) ----
  actions[ACTION_ID.BRTCOMP] = {
    name: 'Brightness Compensation',
    description: 'Adjust the brightness compensation.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: PIC_ADJ_MODE_HELP[2].label,
        id: 'bc',
        tooltip: 'Brightness compensation range: -30 to 30.',
        min: PIC_ADJ_MODE_HELP[2].min,
        max: PIC_ADJ_MODE_HELP[2].max,
        default: PIC_ADJ_MODE_HELP[2].default,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; bc: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { bc: o.bc }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.GRP_BRTCOMP, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}

// Silence unused-variable warning
void openCloseField
