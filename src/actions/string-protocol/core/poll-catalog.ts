import type { DeviceIdentity } from './cmd-support'
import { isCmdOpSupported } from './cmd-support'
import { projectPortOutput } from './port-output'
import { extractValuesForCmd } from '../../../variables/core/registry'

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
  'osd'
]

const INITIAL_DEVICE: readonly string[] = ['sn', 'uh5_st', 'low_pwr', 'allports', 'portout']

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

export function projectPollData(cmd: string, data: unknown): Record<string, number | string | object> {
  if (cmd === 'portout') {
    const projected = projectPortOutput(data)
    if (projected === undefined) return {}
    return { port_output: projected }
  }
  return extractValuesForCmd(cmd, data)
}
