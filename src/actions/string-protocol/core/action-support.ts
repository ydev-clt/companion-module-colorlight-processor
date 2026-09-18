import type { CompanionActionDefinitions } from '@companion-module/base'
import { DeviceProtocolEnum } from '../../../types'
import type { DeviceFamilyId } from '../../../device-models'
import { resolveDeviceModel } from '../../../device-models'
import { logger } from '../../../log'
import { ACTION_ID } from './ids'

const { A, B } = DeviceProtocolEnum
/** Shorthand for actions supported by both protocols (shared readonly instance) */
const AB: readonly DeviceProtocolEnum[] = [A, B]

/** Model-family targets participating in only/except judgment. */
export type SupportTarget = DeviceFamilyId

/**
 * Support rule for a single action:
 *  - `readonly DeviceProtocolEnum[]` — protocol baseline (shorthand; plain
 *    rows stay exactly as compact as before)
 *  - `{ only }` — whitelist: only these families support the action
 *  - `{ protocols, except? }` — protocol baseline minus excluded families
 */
export type SupportRule =
  | readonly DeviceProtocolEnum[]
  | { only: readonly SupportTarget[] }
  | { protocols: readonly DeviceProtocolEnum[]; except?: readonly SupportTarget[] }

/** Both-protocol baseline, U family excluded. */
const AB_EXCEPT_U: SupportRule = { protocols: AB, except: ['U'] }
/** B-protocol baseline, U family excluded. */
const B_EXCEPT_U: SupportRule = { protocols: [B], except: ['U'] }

/** Device identity used for support judgment (both parts probe-derived). */
export interface DeviceIdentity {
  protocol: DeviceProtocolEnum
  /** Probe-resolved model byte; null = not probed / unidentified */
  modelByte: number | null
}

/** Type guard separating the protocol-array shorthand from object rules. */
function isProtocolBaseline(rule: SupportRule): rule is readonly DeviceProtocolEnum[] {
  return Array.isArray(rule)
}

/**
 * Action support matrix — single source of truth.
 *
 * Keys are ACTION_ID *values* (the same keys the setupXxxActions objects
 * produce at runtime). Computed-property keys keep the Record completeness
 * check active: a new ACTION_ID without a row here fails to compile.
 *
 * Layout mirrors the grouping in core/ids.ts for easy cross-reference.
 * U-family exceptions per the B-Protocol device manual (spec §2.1).
 *
 * Set / Get pairs share the same support rule — the protocol-level
 * availability is identical, only the op differs.
 */
export const ACTION_SUPPORT: Record<ACTION_ID, SupportRule> = {
  // === Connection maintenance ===
  [ACTION_ID.HEARTBEAT]: AB,
  [ACTION_ID.CMDLIST]: AB,

  // === Display / picture ===
  [ACTION_ID.BRIGHT_SET]: AB,
  [ACTION_ID.BRIGHT_GET]: AB,
  [ACTION_ID.COLORTEMP_SET]: AB,
  [ACTION_ID.COLORTEMP_GET]: AB,
  [ACTION_ID.FREEZE_SCREEN_SET]: AB,
  [ACTION_ID.FREEZE_SCREEN_GET]: AB,
  [ACTION_ID.BLACKOUT_SET]: AB,
  [ACTION_ID.BLACKOUT_GET]: AB,
  [ACTION_ID.TESTMODE_SET]: AB,
  [ACTION_ID.TESTMODE_GET]: AB,
  [ACTION_ID.HDRMODE_SET]: AB,
  [ACTION_ID.HDRMODE_GET]: AB,
  [ACTION_ID.MUTE_SET]: AB,
  [ACTION_ID.MUTE_GET]: AB,
  [ACTION_ID.FADE_SET]: AB,
  [ACTION_ID.FADE_GET]: AB,
  [ACTION_ID.FADETIME_SET]: AB,
  [ACTION_ID.FADETIME_GET]: AB,
  [ACTION_ID.ZERODELAY_SET]: AB,
  [ACTION_ID.ZERODELAY_GET]: AB,
  [ACTION_ID.UH5_ST_SET]: [A], // A-only; the U family is B-Protocol, never sees it
  [ACTION_ID.UH5_ST_GET]: [A],

  // === Picture adjustment (all unsupported on U-series) ===
  [ACTION_ID.PIC_ADJ_SET]: AB_EXCEPT_U,
  [ACTION_ID.PIC_ADJ_GET]: AB_EXCEPT_U,
  [ACTION_ID.HUE_SET]: AB_EXCEPT_U,
  [ACTION_ID.HUE_GET]: AB_EXCEPT_U,
  [ACTION_ID.SATURATION_SET]: AB_EXCEPT_U,
  [ACTION_ID.SATURATION_GET]: AB_EXCEPT_U,
  [ACTION_ID.CONTRAST_SET]: AB_EXCEPT_U,
  [ACTION_ID.CONTRAST_GET]: AB_EXCEPT_U,
  [ACTION_ID.BRTCOMP_SET]: AB_EXCEPT_U,
  [ACTION_ID.BRTCOMP_GET]: AB_EXCEPT_U,

  // === Preset (ldpreset unsupported on U-series) ===
  [ACTION_ID.QUICK_PRESET]: AB,
  [ACTION_ID.SAVE_PRESET]: AB,
  [ACTION_ID.LOAD_PRESET]: AB_EXCEPT_U,
  [ACTION_ID.RENAME_PRESET]: AB,

  // === Layer ===
  [ACTION_ID.LAYER_SET]: AB,
  [ACTION_ID.LAYER_GET]: AB,
  [ACTION_ID.LAYER_BORDER_SET]: [B],
  [ACTION_ID.LAYER_BORDER_GET]: [B],
  [ACTION_ID.BG_BOX_SET]: AB,
  [ACTION_ID.BG_BOX_GET]: AB,
  [ACTION_ID.LAYER_ORDER]: [B],
  [ACTION_ID.DEL_LAYER]: [B],
  [ACTION_ID.CLEAR_LAYER]: [B],

  // === Network port (brt_port unsupported on U-series) ===
  [ACTION_ID.PORTOUT_SET]: AB,
  [ACTION_ID.PORTOUT_GET]: AB,
  [ACTION_ID.ALLPORTS_SET]: AB,
  [ACTION_ID.ALLPORTS_GET]: AB,
  [ACTION_ID.BRT_PORT_SET]: AB_EXCEPT_U,
  [ACTION_ID.BRT_PORT_GET]: AB_EXCEPT_U,
  [ACTION_ID.C_DEPTH_SET]: AB,
  [ACTION_ID.C_DEPTH_GET]: AB,
  [ACTION_ID.NET_BRT_EN]: [B],

  // === Color / gain (grp_gain unsupported on U-series) ===
  [ACTION_ID.COLORSPACE_SET]: AB,
  [ACTION_ID.COLORSPACE_GET]: AB,
  [ACTION_ID.PREC_MGR_SET]: AB,
  [ACTION_ID.PREC_MGR_GET]: AB,
  [ACTION_ID.CT_R_SET]: AB,
  [ACTION_ID.CT_R_GET]: AB,
  [ACTION_ID.CT_G_SET]: AB,
  [ACTION_ID.CT_G_GET]: AB,
  [ACTION_ID.CT_B_SET]: AB,
  [ACTION_ID.CT_B_GET]: AB,
  [ACTION_ID.GRP_GAIN_SET]: AB_EXCEPT_U,
  [ACTION_ID.GRP_GAIN_GET]: AB_EXCEPT_U,
  [ACTION_ID.VIRTUAL_PIXEL_SET]: AB,
  [ACTION_ID.VIRTUAL_PIXEL_GET]: AB,

  // === Audio / 3D ===
  [ACTION_ID.EYE_SWITCH_SET]: AB,
  [ACTION_ID.EYE_SWITCH_GET]: AB,
  [ACTION_ID.MODE3D_SET]: AB,
  [ACTION_ID.MODE3D_GET]: AB,
  [ACTION_ID.DUAL_3D_SET]: [B],
  [ACTION_ID.DUAL_3D_GET]: [B],
  [ACTION_ID.STEREO_FMT_SET]: AB,
  [ACTION_ID.STEREO_FMT_GET]: AB,

  // === Device (edid_set / brt_rela / ct_rela / brt_step unsupported on U-series) ===
  [ACTION_ID.SN_SET]: AB,
  [ACTION_ID.SN_GET]: AB,
  [ACTION_ID.EDID_SET]: AB_EXCEPT_U,
  [ACTION_ID.BRT_RELA]: AB_EXCEPT_U,
  [ACTION_ID.CT_RELA]: AB_EXCEPT_U,
  [ACTION_ID.BRT_STEP]: AB_EXCEPT_U,
  [ACTION_ID.VSYNC_MUL_SET]: AB,
  [ACTION_ID.VSYNC_MUL_GET]: AB,

  // === Frame rate / system (framerate & low_pwr unsupported on U-series) ===
  [ACTION_ID.FRAMERATE_SET]: AB_EXCEPT_U,
  [ACTION_ID.FRAMERATE_GET]: AB_EXCEPT_U,
  [ACTION_ID.FPS_ADAPT]: [B],
  [ACTION_ID.OSD_SET]: AB,
  [ACTION_ID.OSD_GET]: AB,
  [ACTION_ID.LOW_PWR_SET]: B_EXCEPT_U,
  [ACTION_ID.LOW_PWR_GET]: B_EXCEPT_U,

  // === Probe (query-only; pr_video_count unsupported on U-series) ===
  [ACTION_ID.SNDINFO_GET]: [],
  [ACTION_ID.SND_ETH_GET]: [],
  [ACTION_ID.PR_LAYER_GET]: [],
  [ACTION_ID.PR_GROUP_GET]: [],
  [ACTION_ID.PR_VIDEO_GET]: [],
  [ACTION_ID.PR_VSYNC_GET]: [],
  [ACTION_ID.PORT_AREA_GET]: [],
  // [ACTION_ID.PR_VIDEO_COUNT_GET]: AB_EXCEPT_U,
  [ACTION_ID.PR_VIDEO_COUNT_GET]: [],

  // === Multi-function card (pr_rcv_state unsupported on U-series) ===
  [ACTION_ID.MFC_PROBE_GET]: [],
  [ACTION_ID.RCV_PROBE_GET]: [],
  [ACTION_ID.MOD_PROBE_GET]: [],
  [ACTION_ID.MFC_MANUAL]: AB,
  [ACTION_ID.MFC_AUTO]: AB,
  [ACTION_ID.B_CURVE]: AB,
  // [ACTION_ID.PR_RCV_STATE_GET]: AB_EXCEPT_U,
  [ACTION_ID.PR_RCV_STATE_GET]: [],

  // === Audio preset ===
  [ACTION_ID.LD_AUDPRESET_ID]: [B],
  [ACTION_ID.LD_AUDPRESET_IDX]: [B],

  // === Dangerous operations ===
  [ACTION_ID.RESTOREHOST]: AB,
  [ACTION_ID.REBOOT]: [B],
  [ACTION_ID.SHUTDOWN]: AB,

  // === Custom ===
  [ACTION_ID.RAW_COMMAND]: AB
}

/**
 * Single judgment entry (global strict): an unresolved model supports
 * nothing on any protocol; a known model then evaluates its rule —
 * protocol baseline with optional family except, or a family-only
 * whitelist. Record-only models (no family) never match only/except,
 * i.e. they keep the plain protocol baseline.
 */
export function isActionSupported(actionId: ACTION_ID, device: DeviceIdentity): boolean {
  const model = resolveDeviceModel(device.protocol, device.modelByte)
  if (!model) return false

  // `?? []`: runtime defense for keys outside ACTION_ID (misspelled string
  // keys bypass the compile-time check) — degrades to "unsupported".
  const rule: SupportRule = ACTION_SUPPORT[actionId] ?? []
  if (isProtocolBaseline(rule)) return rule.includes(device.protocol)
  if ('only' in rule) {
    return model.family !== undefined && rule.only.includes(model.family)
  }
  if (!rule.protocols.includes(device.protocol)) return false
  if (!rule.except) return true
  return model.family === undefined || !rule.except.includes(model.family)
}

/**
 * Filter a definitions object down to the actions supported by the device
 * identity. Logs removed ids at debug level ("why is my action missing
 * from the UI?"); warns when the model is unresolved — global strict
 * means zero actions, so the reason must be observable.
 */
export function filterActionsForDevice(
  actions: CompanionActionDefinitions,
  device: DeviceIdentity
): CompanionActionDefinitions {
  if (!resolveDeviceModel(device.protocol, device.modelByte)) {
    logger.warn(
      `filterActionsForDevice: device model unresolved (protocol=${device.protocol}, modelByte=${device.modelByte}) — no actions registered`
    )
    return {}
  }

  const filtered: CompanionActionDefinitions = {}
  const removed: string[] = []
  for (const [id, def] of Object.entries(actions)) {
    if (isActionSupported(id as ACTION_ID, device)) {
      filtered[id] = def
    } else {
      removed.push(id)
    }
  }
  if (removed.length > 0) {
    logger.debug(
      `filterActionsForDevice: removed ${removed.length} action(s) unsupported by protocol=${device.protocol} modelByte=${device.modelByte}: ${removed.join(', ')}`
    )
  }
  return filtered
}
