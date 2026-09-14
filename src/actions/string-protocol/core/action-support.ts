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
 */
export const ACTION_SUPPORT: Record<ACTION_ID, SupportRule> = {
  // === Connection maintenance ===
  [ACTION_ID.HEARTBEAT]: AB,
  [ACTION_ID.CMDLIST]: AB,

  // === Display / picture ===
  [ACTION_ID.BRIGHT]: AB,
  [ACTION_ID.COLORTEMP]: AB,
  [ACTION_ID.FREEZE_SCREEN]: AB,
  [ACTION_ID.BLACKOUT]: AB,
  [ACTION_ID.TESTMODE]: AB,
  [ACTION_ID.HDRMODE]: AB,
  [ACTION_ID.MUTE]: AB,
  [ACTION_ID.FADE]: AB,
  [ACTION_ID.FADETIME]: AB,
  [ACTION_ID.ZERODELAY]: AB,
  [ACTION_ID.UH5_ST]: [A], // A-only; the U family is B-Protocol, never sees it

  // === Picture adjustment (all unsupported on U-series) ===
  [ACTION_ID.PIC_ADJ]: AB_EXCEPT_U,
  [ACTION_ID.HUE]: AB_EXCEPT_U,
  [ACTION_ID.SATURATION]: AB_EXCEPT_U,
  [ACTION_ID.CONTRAST]: AB_EXCEPT_U,
  [ACTION_ID.BRTCOMP]: AB_EXCEPT_U,

  // === Preset (ldpreset unsupported on U-series) ===
  [ACTION_ID.QUICK_PRESET]: AB,
  [ACTION_ID.SAVE_PRESET]: AB,
  [ACTION_ID.LOAD_PRESET]: AB_EXCEPT_U,
  [ACTION_ID.RENAME_PRESET]: AB,

  // === Layer ===
  [ACTION_ID.LAYER]: AB,
  [ACTION_ID.LAYER_BORDER]: [B],
  [ACTION_ID.BG_BOX]: AB,
  [ACTION_ID.LAYER_ORDER]: [B],
  [ACTION_ID.DEL_LAYER]: [B],
  [ACTION_ID.CLEAR_LAYER]: [B],

  // === Network port (brt_port unsupported on U-series) ===
  [ACTION_ID.PORTOUT]: AB,
  [ACTION_ID.ALLPORTS]: AB,
  [ACTION_ID.BRT_PORT]: AB_EXCEPT_U,
  [ACTION_ID.C_DEPTH]: AB,
  [ACTION_ID.NET_BRT_EN]: [B],

  // === Color / gain (grp_gain unsupported on U-series) ===
  [ACTION_ID.COLORSPACE]: AB,
  [ACTION_ID.PREC_MGR]: AB,
  [ACTION_ID.CT_R]: AB,
  [ACTION_ID.CT_G]: AB,
  [ACTION_ID.CT_B]: AB,
  [ACTION_ID.GRP_GAIN]: AB_EXCEPT_U,
  [ACTION_ID.VIRTUAL_PIXEL]: AB,

  // === Audio / 3D ===
  [ACTION_ID.EYE_SWITCH]: AB,
  [ACTION_ID.MODE3D]: AB,
  [ACTION_ID.DUAL_3D]: [B],
  [ACTION_ID.STEREO_FMT]: AB,

  // === Device (edid_set / brt_rela / ct_rela / brt_step unsupported on U-series) ===
  [ACTION_ID.SN]: AB,
  [ACTION_ID.EDID_SET]: AB_EXCEPT_U,
  [ACTION_ID.BRT_RELA]: AB_EXCEPT_U,
  [ACTION_ID.CT_RELA]: AB_EXCEPT_U,
  [ACTION_ID.BRT_STEP]: AB_EXCEPT_U,
  [ACTION_ID.VSYNC_MUL]: AB,

  // === Frame rate / system (framerate & low_pwr unsupported on U-series) ===
  [ACTION_ID.FRAMERATE]: AB_EXCEPT_U,
  [ACTION_ID.FPS_ADAPT]: [B],
  [ACTION_ID.OSD]: AB,
  [ACTION_ID.LOW_PWR]: B_EXCEPT_U,

  // === Probe (query-only; pr_video_count unsupported on U-series) ===
  [ACTION_ID.SNDINFO]: AB,
  [ACTION_ID.SND_ETH]: AB,
  [ACTION_ID.PR_LAYER]: AB,
  [ACTION_ID.PR_GROUP]: AB,
  [ACTION_ID.PR_VIDEO]: AB,
  [ACTION_ID.PR_VSYNC]: AB,
  [ACTION_ID.PORT_AREA]: AB,
  [ACTION_ID.PR_VIDEO_COUNT]: AB_EXCEPT_U,

  // === Multi-function card (pr_rcv_state unsupported on U-series) ===
  [ACTION_ID.MFC_PROBE]: AB,
  [ACTION_ID.RCV_PROBE]: AB,
  [ACTION_ID.MOD_PROBE]: AB,
  [ACTION_ID.MFC_MANUAL]: AB,
  [ACTION_ID.MFC_AUTO]: AB,
  [ACTION_ID.B_CURVE]: AB,
  [ACTION_ID.PR_RCV_STATE]: AB_EXCEPT_U,

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
