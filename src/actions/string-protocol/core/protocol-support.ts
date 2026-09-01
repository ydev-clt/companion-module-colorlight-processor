import type { CompanionActionDefinitions } from '@companion-module/base'
import { DeviceProtocolEnum } from '../../../types'
import { logger } from '../../../log'
import { ACTION_ID } from './ids'

const { A, B } = DeviceProtocolEnum
/** Shorthand for actions supported by both protocols (shared readonly instance) */
const AB: readonly DeviceProtocolEnum[] = [A, B]

/**
 * Protocol support matrix — single source of truth.
 *
 * Keys are ACTION_ID *values* (the same keys the setupXxxActions objects
 * produce at runtime). Computed-property keys keep the Record completeness
 * check active: a new ACTION_ID without a row here fails to compile.
 *
 * Layout mirrors the grouping in core/ids.ts for easy cross-reference.
 */
export const ACTION_PROTOCOL_SUPPORT: Record<ACTION_ID, readonly DeviceProtocolEnum[]> = {
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
  [ACTION_ID.UH5_ST]: [A],

  // === Picture adjustment ===
  [ACTION_ID.PIC_ADJ]: AB,
  [ACTION_ID.HUE]: AB,
  [ACTION_ID.SATURATION]: AB,
  [ACTION_ID.CONTRAST]: AB,
  [ACTION_ID.BRTCOMP]: AB,

  // === Preset ===
  [ACTION_ID.QUICK_PRESET]: AB,
  [ACTION_ID.SAVE_PRESET]: AB,
  [ACTION_ID.LOAD_PRESET]: AB,
  [ACTION_ID.RENAME_PRESET]: AB,

  // === Layer ===
  [ACTION_ID.LAYER]: AB,
  [ACTION_ID.LAYER_BORDER]: [B],
  [ACTION_ID.BG_BOX]: AB,
  [ACTION_ID.LAYER_ORDER]: [B],
  [ACTION_ID.DEL_LAYER]: [B],
  [ACTION_ID.CLEAR_LAYER]: [B],

  // === Network port ===
  [ACTION_ID.PORTOUT]: AB,
  [ACTION_ID.ALLPORTS]: AB,
  [ACTION_ID.BRT_PORT]: AB,
  [ACTION_ID.C_DEPTH]: AB,
  [ACTION_ID.NET_BRT_EN]: [B],

  // === Color / gain ===
  [ACTION_ID.COLORSPACE]: AB,
  [ACTION_ID.PREC_MGR]: AB,
  [ACTION_ID.CT_R]: AB,
  [ACTION_ID.CT_G]: AB,
  [ACTION_ID.CT_B]: AB,
  [ACTION_ID.GRP_GAIN]: AB,
  [ACTION_ID.VIRTUAL_PIXEL]: AB,

  // === Audio / 3D ===
  [ACTION_ID.EYE_SWITCH]: AB,
  [ACTION_ID.MODE3D]: AB,
  [ACTION_ID.DUAL_3D]: [B],
  [ACTION_ID.STEREO_FMT]: AB,

  // === Device ===
  [ACTION_ID.SN]: AB,
  [ACTION_ID.EDID_SET]: AB,
  [ACTION_ID.BRT_RELA]: AB,
  [ACTION_ID.CT_RELA]: AB,
  [ACTION_ID.BRT_STEP]: AB,
  [ACTION_ID.VSYNC_MUL]: AB,

  // === Frame rate / system ===
  [ACTION_ID.FRAMERATE]: AB,
  [ACTION_ID.FPS_ADAPT]: [B],
  [ACTION_ID.OSD]: AB,
  [ACTION_ID.LOW_PWR]: [B],

  // === Probe (query-only) ===
  [ACTION_ID.SNDINFO]: AB,
  [ACTION_ID.SND_ETH]: AB,
  [ACTION_ID.PR_LAYER]: AB,
  [ACTION_ID.PR_GROUP]: AB,
  [ACTION_ID.PR_VIDEO]: AB,
  [ACTION_ID.PR_VSYNC]: AB,
  [ACTION_ID.PORT_AREA]: AB,
  [ACTION_ID.PR_VIDEO_COUNT]: AB,

  // === Multi-function card ===
  [ACTION_ID.MFC_PROBE]: AB,
  [ACTION_ID.RCV_PROBE]: AB,
  [ACTION_ID.MOD_PROBE]: AB,
  [ACTION_ID.MFC_MANUAL]: AB,
  [ACTION_ID.MFC_AUTO]: AB,
  [ACTION_ID.B_CURVE]: AB,
  [ACTION_ID.PR_RCV_STATE]: AB,

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
 * Filter a definitions object down to the actions supported by `protocol`.
 * Logs the removed ids at debug level for troubleshooting ("why is my
 * action missing from the UI?").
 */
export function filterActionsByProtocol(
  actions: CompanionActionDefinitions,
  protocol: DeviceProtocolEnum
): CompanionActionDefinitions {
  const filtered: CompanionActionDefinitions = {}
  const removed: string[] = []

  for (const [id, def] of Object.entries(actions)) {
    if ((ACTION_PROTOCOL_SUPPORT[id as ACTION_ID] ?? []).includes(protocol)) {
      filtered[id] = def
    } else {
      removed.push(id)
    }
  }

  if (removed.length > 0) {
    logger.debug(
      `filterActionsByProtocol: removed ${removed.length} action(s) unsupported by protocol ${protocol}: ${removed.join(', ')}`
    )
  }

  return filtered
}
