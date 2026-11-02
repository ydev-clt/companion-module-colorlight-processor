import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { logger } from '../../../common/log'
import { isCmdOpSupported, type DeviceIdentity } from '../../../common/cmd-support'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, openCloseToggleField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

type Addressed = { deviceId: number; isSelectAll: boolean; gid?: number }

function withGid(gid: number | undefined, data: Record<string, unknown>): Record<string, unknown> {
  if (typeof gid === 'number') data.gid = gid
  return data
}

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
      await conn.sendOnly(
        CMD.CANVAS_SWITCH_MODE,
        'set',
        sid,
        withGid(o.gid, { switchMode: current === 0 ? 1 : 0 })
      )
    }
  }

  actions[ACTION_ID.VSYNC_SRC_SET] = {
    name: 'Set Video Sync',
    description: 'Set one video-sync field: source, input board, internal frame rate, or phase.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'dropdown',
        label: 'Operation',
        id: 'operation',
        default: 'source',
        choices: [
          { id: 'source', label: 'Set source' },
          { id: 'board', label: 'Set input board' },
          { id: 'fps', label: 'Set internal frame rate' },
          { id: 'phase', label: 'Set phase' }
        ]
      },
      {
        type: 'dropdown',
        label: 'Source',
        id: 'src',
        default: 1,
        isVisibleExpression: '$(options:operation) == "source"',
        choices: [
          { id: 0, label: 'Input' },
          { id: 1, label: 'Genlock' },
          { id: 2, label: 'Internal' },
          { id: 3, label: 'Auto lock' },
          { id: 4, label: 'ODCK' }
        ]
      },
      {
        type: 'number',
        label: 'Board slot',
        id: 'boardSlot',
        min: 0,
        max: 255,
        default: 0,
        isVisibleExpression: '$(options:operation) == "board"'
      },
      {
        type: 'number',
        label: 'Board kind',
        id: 'boardKind',
        min: 0,
        max: 255,
        default: 0,
        isVisibleExpression: '$(options:operation) == "board"'
      },
      {
        type: 'number',
        label: 'Board index',
        id: 'boardIdx',
        min: 0,
        max: 255,
        default: 0,
        isVisibleExpression: '$(options:operation) == "board"'
      },
      {
        type: 'number',
        label: 'Source type',
        id: 'srcType',
        min: 0,
        max: 255,
        default: 0,
        isVisibleExpression: '$(options:operation) == "board"'
      },
      {
        type: 'number',
        label: 'Source index',
        id: 'srcIdx',
        min: 0,
        max: 255,
        default: 0,
        isVisibleExpression: '$(options:operation) == "board"'
      },
      {
        type: 'number',
        label: 'Internal frame rate x100',
        id: 'fps100',
        min: 0,
        max: 100000,
        default: 6000,
        isVisibleExpression: '$(options:operation) == "fps"'
      },
      {
        type: 'number',
        label: 'Phase (us)',
        id: 'phaseUs',
        min: -1000000,
        max: 1000000,
        default: 0,
        isVisibleExpression: '$(options:operation) == "phase"'
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as Addressed & {
        operation: 'source' | 'board' | 'fps' | 'phase'
        src: number
        boardSlot: number
        boardKind: number
        boardIdx: number
        srcType: number
        srcIdx: number
        fps100: number
        phaseUs: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = {}
      if (o.operation === 'board') {
        data.boardSlot = o.boardSlot
        data.boardKind = o.boardKind
        data.boardIdx = o.boardIdx
        data.srcType = o.srcType
        data.srcIdx = o.srcIdx
      } else if (o.operation === 'fps') {
        data.fps100 = o.fps100
      } else if (o.operation === 'phase') {
        data.phaseUs = o.phaseUs
      } else {
        data.src = o.src
      }
      await conn.sendOnly(CMD.VSYNC_SRC, 'set', sid, withGid(o.gid, data))
    }
  }

  return actions as CompanionActionDefinitions
}
