import type { CompanionActionDefinition, CompanionActionDefinitions, DropdownChoice } from '@companion-module/base'
import { logger } from '../../../common/log'
import { isCmdOpSupported, type DeviceIdentity } from '../../../common/cmd-support'
import { resolveDeviceModel } from '../../../common/device-models'
import { inputVideoSourceChoices, type VsyncSourceChoice, vsyncSrcSetSteps } from '../../../common/input-video-sources'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, openCloseToggleField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

type Addressed = { deviceId: number; isSelectAll: boolean; gid?: number }

/**
 * Input-signal rows from the last successful probe. An empty list stays empty
 * until `pr_vin_board` and `pr_video` return signals.
 */
function inputSourceChoices(host: StringActionHost): DropdownChoice[] {
  const modelLabel = resolveDeviceModel(host.ctx.config.protocol, host.ctx.state.modelByte)?.label
  return inputVideoSourceChoices(host.ctx.state.inputVideoSources ?? [], modelLabel)
}

/** Attach gid only when the button supplied one. Omitting it lets the device use its default screen group. */
function withGid(gid: number | undefined, data: Record<string, unknown>): Record<string, unknown> {
  if (typeof gid === 'number') data.gid = gid
  return data
}

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
  const requestData = typeof options.gid === 'number' ? { gid: options.gid } : undefined
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
  const identity: DeviceIdentity = {
    protocol: host.ctx.config.protocol,
    modelByte: host.ctx.state.modelByte
  }
  const actions: Record<string, CompanionActionDefinition> = {}

  actions[ACTION_ID.LOW_GRAY_SET] = {
    name: 'Set Low Gray',
    description: 'Turn low-brightness high-gray on, off, or toggle it.',
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
      const requestData = typeof o.gid === 'number' ? { gid: o.gid } : undefined
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
      const requestData = typeof o.gid === 'number' ? { gid: o.gid } : undefined
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
