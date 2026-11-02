import { isCmdOpSupported, type DeviceIdentity } from '../../common/cmd-support'
import { extractValuesForCmd } from '../core/registry'
import { projectPortOutput } from './port-output'

export type PollPhase = 'initial' | 'reserved'
export type PollScope = 'screen-group' | 'device'

export interface PollEntry {
  cmd: string
  scope: PollScope
  phase: PollPhase
}

export interface PollRequest {
  cmd: string
  sid: 1
  gid?: number
  data?: Record<string, unknown>
}

const POLL_SID = 1 as const

/** Screen-group commands read once per gid during the startup poll. */
const INITIAL_SCREEN: readonly string[] = [
  'bright',
  'colortemp',
  'freeze',
  'blackout',
  'testmode',
  'hdrmode',
  'mute',
  'fade',
  'fadetime',
  'zerodelay',
  'grp_hue',
  'grp_saturation',
  'grp_contrast',
  'grp_brtcomp',
  'bg_box',
  'c_depth',
  'colorspace',
  'prec_mgr',
  'ct_r',
  'ct_g',
  'ct_b',
  'grp_gain',
  'virtual_pixel',
  'eye_switch',
  'mode3d',
  'dual_3d',
  'stereo_fmt',
  'vsync_mul',
  'framerate',
  'osd',
  'low_gray',
  'canvas_mode',
  'canvas_switch_mode',
  'out_fps',
  'vsync_src'
]

/** Device-wide commands read once, on sid 1, during the startup poll. */
const INITIAL_DEVICE: readonly string[] = ['sn', 'uh5_st', 'low_pwr', 'allports', 'portout']

/**
 * Known commands that are not read at startup. They stay in the catalog so a
 * later poll phase can opt in without a second command list.
 */
const RESERVED: readonly string[] = [
  'layer',
  'layer_border',
  'brt_port',
  'pic_adj',
  'sndinfo',
  'snd_eth',
  'pr_layer',
  'pr_group',
  'pr_video',
  'pr_vsync',
  'port_area',
  'pr_video_count',
  'mfc_probe',
  'rcv_probe',
  'mod_probe',
  'pr_rcv_state'
]

function entry(cmd: string, scope: PollScope, phase: PollPhase): PollEntry {
  return { cmd, scope, phase }
}

/** Spec order: screen-group initial, then device initial, then reserved. */
export const POLL_CATALOG: readonly PollEntry[] = [
  ...INITIAL_SCREEN.map((cmd) => entry(cmd, 'screen-group', 'initial')),
  ...INITIAL_DEVICE.map((cmd) => entry(cmd, 'device', 'initial')),
  ...RESERVED.map((cmd) => entry(cmd, 'device', 'reserved'))
]

/**
 * Build the startup get list for this device.
 * Unsupported commands are omitted. Screen-group commands repeat once per gid.
 * `portout` requires a port in the request; startup samples port 1.
 */
export function selectPollRequests(device: DeviceIdentity, groupIds: readonly number[]): PollRequest[] {
  const requests: PollRequest[] = []
  for (const item of POLL_CATALOG) {
    if (item.phase !== 'initial') continue
    if (!isCmdOpSupported(item.cmd, 'get', device)) continue
    if (item.scope === 'screen-group') {
      for (const gid of groupIds) {
        requests.push({ cmd: item.cmd, sid: POLL_SID, gid, data: { gid } })
      }
      continue
    }
    if (item.cmd === 'portout') {
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
 * `out_fps` arrives as fps×10000. `vsync_src` publishes each source, or a
 * blank string when that field is missing.
 */
function projectCanvasSync(cmd: string, data: unknown): Record<string, number | string> | undefined {
  if (
    cmd !== 'low_gray' &&
    cmd !== 'canvas_mode' &&
    cmd !== 'canvas_switch_mode' &&
    cmd !== 'out_fps' &&
    cmd !== 'vsync_src'
  ) {
    return undefined
  }
  const obj = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  if (cmd === 'low_gray') {
    const en = finiteNumber(obj.en)
    return en === 0 || en === 1 ? { low_gray_enable: en } : {}
  }
  if (cmd === 'canvas_mode') {
    const mode = finiteNumber(obj.mode)
    return obj.valid === 1 && mode !== undefined ? { canvas_mode: mode } : { canvas_mode: '' }
  }
  if (cmd === 'canvas_switch_mode') {
    const switchMode = finiteNumber(obj.switchMode)
    return obj.valid === 1 && switchMode !== undefined
      ? { canvas_switch_mode: switchMode }
      : { canvas_switch_mode: '' }
  }
  if (cmd === 'out_fps') {
    const fps = finiteNumber(obj.fps10000)
    return obj.valid === 1 && fps !== undefined
      ? { output_frame_rate: Number((fps / 10000).toFixed(4)) }
      : { output_frame_rate: '' }
  }
  const src = finiteNumber(obj.src)
  const curSrc = finiteNumber(obj.curSrc)
  return {
    vsync_source: src === undefined ? '' : src,
    vsync_current_source: curSrc === undefined ? '' : curSrc
  }
}

/**
 * Turn one get payload into variable leaves. `portout` and the canvas
 * commands have their own shapes; every other command uses the variable registry.
 */
export function projectPollData(cmd: string, data: unknown): Record<string, number | string | object> {
  if (cmd === 'portout') {
    const projected = projectPortOutput(data)
    if (projected === undefined) return {}
    return { port_output: projected }
  }
  const canvas = projectCanvasSync(cmd, data)
  if (canvas !== undefined) return canvas
  return extractValuesForCmd(cmd, data)
}
