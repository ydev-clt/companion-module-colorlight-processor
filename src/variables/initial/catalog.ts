import { CMD, type Cmd } from '../../common/commands'
import { isCmdOpSupported, type DeviceIdentity } from '../../common/cmd-support'
import { extractValuesForCmd } from '../core/registry'
import type { ScreenGroupSlot } from '../screen-groups'
import { projectPortOutput } from './port-output'

export type PollPhase = 'initial' | 'reserved'
export type PollScope = 'screen-group' | 'device'

export interface PollEntry {
  cmd: Cmd
  scope: PollScope
  phase: PollPhase
}

export interface PollRequest {
  cmd: Cmd
  sid: 1
  gid?: number
  data?: Record<string, unknown>
}

const POLL_SID = 1 as const

/** Screen-group commands read once per gid during the startup poll. */
export const INITIAL_SCREEN_COMMANDS: readonly Cmd[] = [
  CMD.BRIGHT,
  CMD.COLORTEMP,
  CMD.FREEZE,
  CMD.BLACKOUT,
  CMD.TESTMODE,
  CMD.HDRMODE,
  CMD.MUTE,
  CMD.FADE,
  CMD.FADETIME,
  CMD.ZERODELAY,
  CMD.GRP_HUE,
  CMD.GRP_SATURATION,
  CMD.GRP_CONTRAST,
  CMD.GRP_BRTCOMP,
  CMD.BG_BOX,
  CMD.C_DEPTH,
  CMD.COLORSPACE,
  CMD.PREC_MGR,
  CMD.CT_R,
  CMD.CT_G,
  CMD.CT_B,
  CMD.GRP_GAIN,
  CMD.VIRTUAL_PIXEL,
  CMD.EYE_SWITCH,
  CMD.MODE3D,
  CMD.DUAL_3D,
  CMD.STEREO_FMT,
  CMD.VSYNC_MUL,
  CMD.FRAMERATE,
  CMD.OSD,
  CMD.LOW_GRAY,
  CMD.CANVAS_MODE,
  CMD.CANVAS_SWITCH_MODE,
  CMD.OUT_FPS,
  CMD.VSYNC_SRC
]

/** Device-wide commands read once, on sid 1, during the startup poll. */
export const INITIAL_DEVICE_COMMANDS: readonly Cmd[] = [CMD.SN, CMD.UH5_ST, CMD.LOW_PWR, CMD.ALLPORTS, CMD.PORTOUT]

/**
 * Known commands that are not read at startup. They stay in the catalog so a
 * later poll phase can opt in without a second command list.
 */
const RESERVED: readonly Cmd[] = [
  CMD.LAYER,
  CMD.LAYER_BORDER,
  CMD.BRT_PORT,
  CMD.PIC_ADJ,
  CMD.SNDINFO,
  CMD.SND_ETH,
  CMD.PR_LAYER,
  CMD.PR_GROUP,
  CMD.PR_VIDEO,
  CMD.PR_VSYNC,
  CMD.PORT_AREA,
  CMD.PR_VIDEO_COUNT,
  CMD.MFC_PROBE,
  CMD.RCV_PROBE,
  CMD.MOD_PROBE,
  CMD.PR_RCV_STATE
]

function entry(cmd: Cmd, scope: PollScope, phase: PollPhase): PollEntry {
  return { cmd, scope, phase }
}

/** Spec order: screen-group initial, then device initial, then reserved. */
export const POLL_CATALOG: readonly PollEntry[] = [
  ...INITIAL_SCREEN_COMMANDS.map((cmd) => entry(cmd, 'screen-group', 'initial')),
  ...INITIAL_DEVICE_COMMANDS.map((cmd) => entry(cmd, 'device', 'initial')),
  ...RESERVED.map((cmd) => entry(cmd, 'device', 'reserved'))
]

/** Membership test for the initial screen-group commands. */
const SCREEN_COMMAND_SET = new Set<Cmd>(INITIAL_SCREEN_COMMANDS)

/**
 * Screen-group requests for `slots`, in slot order.
 * Shared by the startup poll and by the one-shot sync that runs when a push
 * adds a screen group. Commands that are not initial screen-group entries are
 * skipped.
 */
export function selectScreenRequests(slots: readonly ScreenGroupSlot[]): PollRequest[] {
  const requests: PollRequest[] = []
  for (const slot of slots) {
    if (!SCREEN_COMMAND_SET.has(slot.cmd)) continue
    requests.push({ cmd: slot.cmd, sid: POLL_SID, gid: slot.gid, data: { gid: slot.gid } })
  }
  return requests
}

/**
 * Build the startup get list for this device.
 * Screen-group requests follow the published slots, one group at a time.
 * Unsupported device commands are omitted. `portout` samples port 1.
 */
export function selectPollRequests(device: DeviceIdentity, slots: readonly ScreenGroupSlot[]): PollRequest[] {
  const requests = selectScreenRequests(slots)
  for (const item of POLL_CATALOG) {
    if (item.phase !== 'initial' || item.scope !== 'device') continue
    if (!isCmdOpSupported(item.cmd, 'get', device)) continue
    if (item.cmd === CMD.PORTOUT) {
      requests.push({ cmd: item.cmd, sid: POLL_SID, data: { port: 1 } })
      continue
    }
    requests.push({ cmd: item.cmd, sid: POLL_SID })
  }
  return requests
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * `canvas_mode`, `canvas_switch_mode`, and `out_fps` publish a blank string
 * when `valid` is not 1, so Companion shows an empty value instead of a stale
 * mode. `low_gray` has no valid flag and is kept only for en 0 or 1.
 * `out_fps` arrives as fps×10000. `vsync_src` keeps only `src`.
 */
function projectCanvasSync(cmd: string, data: unknown): Record<string, number | string> | undefined {
  if (cmd !== CMD.LOW_GRAY && cmd !== CMD.CANVAS_MODE && cmd !== CMD.CANVAS_SWITCH_MODE && cmd !== CMD.OUT_FPS) {
    return undefined
  }
  const obj = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  if (cmd === CMD.LOW_GRAY) {
    const en = finiteNumber(obj.en)
    return en === 0 || en === 1 ? { low_gray_enable: en } : {}
  }
  if (cmd === CMD.CANVAS_MODE) {
    const mode = finiteNumber(obj.mode)
    return obj.valid === 1 && mode !== undefined ? { canvas_mode: mode } : { canvas_mode: '' }
  }
  if (cmd === CMD.CANVAS_SWITCH_MODE) {
    const switchMode = finiteNumber(obj.switchMode)
    return obj.valid === 1 && switchMode !== undefined ? { canvas_switch_mode: switchMode } : { canvas_switch_mode: '' }
  }
  const fps = finiteNumber(obj.fps10000)
  return obj.valid === 1 && fps !== undefined
    ? { output_frame_rate: Number((fps / 10000).toFixed(4)) }
    : { output_frame_rate: '' }
}

/**
 * Turn one get payload into variable leaves. `portout` and the canvas
 * commands have their own shapes; every other command uses the variable registry.
 */
export function projectPollData(cmd: string, data: unknown): Record<string, number | string | object> {
  if (cmd === CMD.PORTOUT) {
    const projected = projectPortOutput(data)
    if (projected === undefined) return {}
    return { port_output: projected }
  }
  const canvas = projectCanvasSync(cmd, data)
  if (canvas !== undefined) return canvas
  return extractValuesForCmd(cmd, data)
}
