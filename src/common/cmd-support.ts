import { DeviceProtocolEnum } from './types'
import type { DeviceFamilyId } from './device-models'
import { resolveDeviceModel } from './device-models'

const { A, B } = DeviceProtocolEnum
/** Shorthand for commands supported by both protocols (shared readonly instance) */
const AB: readonly DeviceProtocolEnum[] = [A, B]

/** Model-family targets participating in only/except judgment. */
export type SupportTarget = DeviceFamilyId

/**
 * Support rule for a single command operation:
 *  - `readonly DeviceProtocolEnum[]` — protocol baseline (shorthand; plain
 *    rows stay exactly as compact as before)
 *  - `{ only }` — whitelist: only these families support the command
 *  - `{ protocols, except? }` — protocol baseline minus excluded families
 *  - `'always'` — no device restriction, including an unresolved model
 */
export type SupportRule =
  | readonly DeviceProtocolEnum[]
  | { only: readonly SupportTarget[] }
  | { protocols: readonly DeviceProtocolEnum[]; except?: readonly SupportTarget[] }
  | 'always'

export type CmdOp = 'get' | 'set'

/** Device identity used for support judgment (both parts probe-derived). */
export interface DeviceIdentity {
  protocol: DeviceProtocolEnum
  /** Probe-resolved model byte; null = not probed / unidentified */
  modelByte: number | null
}

export interface CmdSupport {
  get?: SupportRule
  set?: SupportRule
}

const AB_EXCEPT_V_VX: SupportRule = { protocols: AB, except: ['V', 'VX'] }
const AB_EXCEPT_U_V_VX: SupportRule = { protocols: AB, except: ['U', 'V', 'VX'] }
const B_EXCEPT_V_VX: SupportRule = { protocols: [B], except: ['V', 'VX'] }
const B_EXCEPT_U_V_VX: SupportRule = { protocols: [B], except: ['U', 'V', 'VX'] }
const EMPTY_GET: SupportRule = []
const V_VX_ONLY: SupportRule = { only: ['V', 'VX'] }

/** Type guard separating the protocol-array shorthand from object rules. */
function isProtocolBaseline(rule: SupportRule): rule is readonly DeviceProtocolEnum[] {
  return Array.isArray(rule)
}

/**
 * Command support matrix — get and set stored independently per command.
 *
 * A missing side is unsupported. An empty protocol array is also unsupported
 * (used by probe-only gets that later tasks must not poll).
 */
export const CMD_SUPPORT: Record<string, CmdSupport> = {
  // Both sides AB
  bright: { get: AB, set: AB },
  colortemp: { get: AB, set: AB },
  freeze: { get: AB, set: AB },
  blackout: { get: AB, set: AB },
  testmode: { get: AB, set: AB },
  c_depth: { get: AB, set: AB },
  ct_r: { get: AB, set: AB },
  ct_g: { get: AB, set: AB },
  ct_b: { get: AB, set: AB },

  // Both sides AB except V / VX
  hdrmode: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  mute: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  fade: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  fadetime: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  zerodelay: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  layer: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  bg_box: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  portout: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  allports: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  colorspace: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  prec_mgr: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  virtual_pixel: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  eye_switch: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  mode3d: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  stereo_fmt: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  sn: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  vsync_mul: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },
  osd: { get: AB_EXCEPT_V_VX, set: AB_EXCEPT_V_VX },

  // Both sides AB except U / V / VX
  pic_adj: { get: AB_EXCEPT_U_V_VX, set: AB_EXCEPT_U_V_VX },
  grp_hue: { get: AB_EXCEPT_U_V_VX, set: AB_EXCEPT_U_V_VX },
  grp_saturation: { get: AB_EXCEPT_U_V_VX, set: AB_EXCEPT_U_V_VX },
  grp_contrast: { get: AB_EXCEPT_U_V_VX, set: AB_EXCEPT_U_V_VX },
  grp_brtcomp: { get: AB_EXCEPT_U_V_VX, set: AB_EXCEPT_U_V_VX },
  brt_port: { get: AB_EXCEPT_U_V_VX, set: AB_EXCEPT_U_V_VX },
  grp_gain: { get: AB_EXCEPT_U_V_VX, set: AB_EXCEPT_U_V_VX },
  framerate: { get: AB_EXCEPT_U_V_VX, set: AB_EXCEPT_U_V_VX },

  // Both sides A-only
  uh5_st: { get: [A], set: [A] },

  // Both sides B except V / VX
  layer_border: { get: B_EXCEPT_V_VX, set: B_EXCEPT_V_VX },
  dual_3d: { get: B_EXCEPT_V_VX, set: B_EXCEPT_V_VX },

  // Both sides B except U / V / VX
  low_pwr: { get: B_EXCEPT_U_V_VX, set: B_EXCEPT_U_V_VX },

  // set only, AB
  qp: { set: AB },

  // set only, AB except V / VX
  svpreset: { set: AB_EXCEPT_V_VX },
  rpname: { set: AB_EXCEPT_V_VX },
  mfc_manual: { set: AB_EXCEPT_V_VX },

  // set only, AB except U / V / VX
  ldpreset: { set: AB_EXCEPT_U_V_VX },
  edid_set: { set: AB_EXCEPT_U_V_VX },
  brt_rela: { set: AB_EXCEPT_U_V_VX },
  ct_rela: { set: AB_EXCEPT_U_V_VX },
  brt_step: { set: AB_EXCEPT_U_V_VX },

  // set only, B except V / VX
  layerorder: { set: B_EXCEPT_V_VX },
  dellayer: { set: B_EXCEPT_V_VX },
  clear_layer: { set: B_EXCEPT_V_VX },
  net_brt_en: { set: B_EXCEPT_V_VX },
  fps_adapt: { set: B_EXCEPT_V_VX },
  ld_audpreset_idx: { set: B_EXCEPT_V_VX },
  reboot: { set: B_EXCEPT_V_VX },

  // set only; both protocol names, matching ACTION_SUPPORT SHUTDOWN
  shutdown: { set: { protocols: [A, B], except: ['V', 'VX'] } },

  // V/VX canvas sync (libsp 1.0.7). No set side means no action.
  low_gray: { get: V_VX_ONLY, set: V_VX_ONLY },
  canvas_switch_mode: { get: V_VX_ONLY, set: V_VX_ONLY },
  vsync_src: { get: V_VX_ONLY, set: V_VX_ONLY },
  take: { set: V_VX_ONLY },
  cut: { set: V_VX_ONLY },
  canvas_mode: { get: V_VX_ONLY },
  out_fps: { get: V_VX_ONLY },

  // get: [] and no set (probe-only; not polled)
  sndinfo: { get: EMPTY_GET },
  snd_eth: { get: EMPTY_GET },
  pr_layer: { get: EMPTY_GET },
  pr_group: { get: EMPTY_GET },
  pr_video: { get: EMPTY_GET },
  pr_vsync: { get: EMPTY_GET },
  port_area: { get: EMPTY_GET },
  pr_video_count: { get: EMPTY_GET },
  mfc_probe: { get: EMPTY_GET },
  rcv_probe: { get: EMPTY_GET },
  mod_probe: { get: EMPTY_GET },
  pr_rcv_state: { get: EMPTY_GET }
}

/**
 * Whether this device may run `cmd` as get or set.
 * An unresolved model fails closed, except for the `'always'` rule.
 * A model with no family still matches a protocol baseline. An `except` rule
 * only removes known families, so a family-less model stays supported when
 * its protocol matches. An `only` rule requires a listed family.
 */
export function isCmdOpSupported(cmd: string, op: CmdOp, device: DeviceIdentity): boolean {
  const rule = CMD_SUPPORT[cmd]?.[op]
  if (rule === undefined) return false
  if (rule === 'always') return true
  const model = resolveDeviceModel(device.protocol, device.modelByte)
  if (!model) return false
  if (isProtocolBaseline(rule)) return rule.includes(device.protocol)
  if ('only' in rule) return model.family !== undefined && rule.only.includes(model.family)
  if (!rule.protocols.includes(device.protocol)) return false
  if (!rule.except) return true
  return model.family === undefined || !rule.except.includes(model.family)
}
