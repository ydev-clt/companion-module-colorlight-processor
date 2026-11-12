import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { logger } from '../../../common/log'
import { isCmdOpSupported, type DeviceIdentity } from '../../../common/cmd-support'
import { inputVideoSourceFromChoiceId } from '../../../common/input-video-sources'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import {
  deviceAndBroadcastFields,
  deviceIdentity,
  gidData,
  gidField,
  inputSourceChoices,
  openCloseToggleField,
  requestGid,
  sidFromOptions,
  withGid
} from './_shared'
import type { StringActionHost } from './_shared'

type VsyncSourceChoice = 'internal' | 'input' | 'genlock'

type Addressed = { deviceId: number; isSelectAll: boolean; gid?: number }

/** `vsync_src` source values kept by the action. */
export const VSYNC_SOURCE = {
  INPUT: 0,
  GENLOCK: 1,
  INTERNAL: 2
} as const

/**
 * Take, Cut, and canvas switch mode are legal only in switcher mode:
 * canvas_mode.valid === 1 and mode === 1. A failed or unsupported read skips
 * the set instead of sending a command the device would reject.
 */
async function inSwitcherMode(
  conn: StringActionHost['conn'],
  identity: DeviceIdentity,
  featureName: 'Take' | 'Cut' | 'Canvas switch mode',
  options: Addressed
): Promise<boolean> {
  const sid = sidFromOptions(options.isSelectAll, options.deviceId)
  if (!isCmdOpSupported(CMD.CANVAS_MODE, 'get', identity)) {
    logger.warn(`${featureName} skipped: GET canvas_mode is not supported on this device.`)
    return false
  }
  const requestData = requestGid(options.gid)
  const resp = await conn.sendAndAwait<unknown, { mode?: unknown; valid?: unknown }>(
    CMD.CANVAS_MODE,
    'get',
    sid,
    requestData
  )
  const mode = Number(resp?.data?.mode)
  const valid = Number(resp?.data?.valid)
  if (!resp || resp.code !== 0 || valid !== 1 || mode !== 1) {
    logger.warn(`${featureName} skipped: screen group is not in switcher mode.`)
    return false
  }
  return true
}

/**
 * V/VX canvas actions. An option value of 2 means toggle: read the current
 * value, then write the opposite. Open/close and copy/swap write the chosen
 * value directly.
 */
export function setupCanvasActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const identity: DeviceIdentity = deviceIdentity(host)
  const actions: Record<string, CompanionActionDefinition> = {}

  actions[ACTION_ID.LOW_GRAY_SET] = {
    name: 'Set Low-Brightness High-Gray',
    description: 'Turn low-brightness high-gray enable, disable, or toggle it.',
    options: [...deviceAndBroadcastFields(), openCloseToggleField(1), gidField()],
    callback: async (event) => {
      const o = event.options as Addressed & { enableStatus: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      if (o.enableStatus !== 2) {
        await conn.sendOnly(CMD.LOW_GRAY, 'set', sid, withGid(o.gid, { en: o.enableStatus }))
        return
      }
      if (!isCmdOpSupported(CMD.LOW_GRAY, 'get', identity)) {
        logger.warn('Low gray skipped: GET low_gray is not supported on this device.')
        return
      }
      const requestData = requestGid(o.gid)
      const resp = await conn.sendAndAwait<unknown, { en?: unknown }>(CMD.LOW_GRAY, 'get', sid, requestData)
      const current = Number(resp?.data?.en)
      if (!resp || resp.code !== 0 || (current !== 0 && current !== 1)) {
        logger.warn('Low gray skipped: GET low_gray did not return en 0 or 1.')
        return
      }
      await conn.sendOnly(CMD.LOW_GRAY, 'set', sid, withGid(o.gid, { en: current === 1 ? 0 : 1 }))
    }
  }

  actions[ACTION_ID.TAKE] = {
    name: 'Take',
    description: 'Fade between preview and program. Requires switcher mode.',
    options: [...deviceAndBroadcastFields(), gidField()],
    callback: async (event) => {
      const o = event.options as Addressed
      if (!(await inSwitcherMode(conn, identity, 'Take', o))) return
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      await conn.sendOnly(CMD.TAKE, 'set', sid, withGid(o.gid, {}))
    }
  }

  actions[ACTION_ID.CUT] = {
    name: 'Cut',
    description: 'Cut between preview and program. Requires switcher mode.',
    options: [...deviceAndBroadcastFields(), gidField()],
    callback: async (event) => {
      const o = event.options as Addressed
      if (!(await inSwitcherMode(conn, identity, 'Cut', o))) return
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      await conn.sendOnly(CMD.CUT, 'set', sid, withGid(o.gid, {}))
    }
  }

  actions[ACTION_ID.CANVAS_SWITCH_MODE_SET] = {
    name: 'Set Canvas Switch Mode',
    description: 'Set copy or swap, or toggle the current switch mode. Requires switcher mode.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Switch mode',
        id: 'switchMode',
        default: 0,
        choices: [
          { id: 0, label: 'Copy' },
          { id: 1, label: 'Swap' },
          { id: 2, label: 'Toggle' }
        ]
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as Addressed & { switchMode: number }
      if (!(await inSwitcherMode(conn, identity, 'Canvas switch mode', o))) return
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      if (o.switchMode !== 2) {
        await conn.sendOnly(CMD.CANVAS_SWITCH_MODE, 'set', sid, withGid(o.gid, { switchMode: o.switchMode }))
        return
      }
      if (!isCmdOpSupported(CMD.CANVAS_SWITCH_MODE, 'get', identity)) {
        logger.warn('Canvas switch mode skipped: GET canvas_switch_mode is not supported on this device.')
        return
      }
      const requestData = requestGid(o.gid)
      const resp = await conn.sendAndAwait<unknown, { switchMode?: unknown; valid?: unknown }>(
        CMD.CANVAS_SWITCH_MODE,
        'get',
        sid,
        requestData
      )
      const current = Number(resp?.data?.switchMode)
      const valid = Number(resp?.data?.valid)
      if (!resp || resp.code !== 0 || valid !== 1 || (current !== 0 && current !== 1)) {
        logger.warn('Canvas switch mode skipped: current switchMode is not 0 or 1.')
        return
      }
      await conn.sendOnly(CMD.CANVAS_SWITCH_MODE, 'set', sid, withGid(o.gid, { switchMode: current === 0 ? 1 : 0 }))
    }
  }

  const inputChoices = inputSourceChoices(host)
  actions[ACTION_ID.VSYNC_SRC_SET] = {
    name: 'Set Video Sync',
    description: 'Set the video-sync source to internal, an input signal, or GenLock.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Source',
        id: 'src',
        default: 'genlock',
        disableAutoExpression: true,
        choices: [
          { id: 'internal', label: 'Internal' },
          { id: 'input', label: 'Input signal' },
          { id: 'genlock', label: 'GenLock' }
        ]
      },
      {
        type: 'number',
        label: 'Internal frame rate (Hz)',
        id: 'fps',
        min: 0,
        max: 240,
        step: 0.01,
        default: 60,
        isVisibleExpression: '$(options:src) == "internal"'
      },
      {
        type: 'dropdown',
        label: 'Input signal',
        id: 'inputSource',
        default: inputChoices[0]?.id ?? '',
        choices: inputChoices,
        minChoicesForSearch: 8,
        isVisibleExpression: '$(options:src) == "input"'
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as Addressed & {
        src: VsyncSourceChoice
        fps: number
        inputSource: string
      }
      const steps = vsyncSrcSetSteps({ src: o.src, fps: o.fps, inputSource: o.inputSource, gid: o.gid })
      if (!steps) {
        logger.warn('Video sync skipped: the selected source has no value to send.')
        return
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      for (const data of steps) {
        await conn.sendOnly(CMD.VSYNC_SRC, 'set', sid, data)
      }
    }
  }

  return actions as CompanionActionDefinitions
}

export interface VsyncSrcSetInput {
  src: VsyncSourceChoice
  /** Hertz shown in the button. Sent only for the internal source. */
  fps?: number
  /** Choice id of the selected input signal. */
  inputSource?: string
  /** Microseconds of phase. Sent as its own request after `src` when present. */
  phaseUs?: number
  gid?: number
}

/**
 * Display hertz to the protocol's fps×100 integer. 59.94 becomes 5994.
 * A non-finite or negative value cannot be sent.
 */
export function fpsToFps100(fps: number): number | undefined {
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 0) return undefined
  return Math.round(fps * 100)
}

/**
 * Ordered `vsync_src` set bodies.
 *
 * The device applies one sub-item per request, so `src` is sent alone first.
 * The matching detail follows in its own request: board fields when `src` is
 * an input signal, `fps100` when it is internal. GenLock has no second body.
 * `phaseUs` is its own sub-item and is appended only when a phase is given.
 * Returns undefined when the chosen source has no usable value.
 */
export function vsyncSrcSetSteps(input: VsyncSrcSetInput): Record<string, unknown>[] | undefined {
  const gid = gidData(input.gid)
  let steps: Record<string, unknown>[] | undefined
  if (input.src === 'genlock') {
    steps = [{ ...gid, src: VSYNC_SOURCE.GENLOCK }]
  } else if (input.src === 'internal') {
    const fps100 = fpsToFps100(input.fps ?? Number.NaN)
    if (fps100 === undefined) return undefined
    steps = [
      { ...gid, src: VSYNC_SOURCE.INTERNAL },
      { ...gid, fps100 }
    ]
  } else {
    const source = inputVideoSourceFromChoiceId(input.inputSource ?? '')
    if (!source) return undefined
    steps = [
      { ...gid, src: VSYNC_SOURCE.INPUT },
      {
        ...gid,
        boardSlot: source.slotCode,
        boardKind: source.boardKind,
        boardIdx: source.boardIdx,
        srcType: source.srcType,
        srcIdx: source.srcIdx
      }
    ]
  }
  if (typeof input.phaseUs === 'number' && Number.isFinite(input.phaseUs)) {
    steps.push({ ...gid, phaseUs: input.phaseUs })
  }
  return steps
}
