import type { CompanionVariableDefinition } from '@companion-module/base'
import type { ProcessorBase } from '../types'
import { logger } from '../log'
import { VARIABLE_GROUPS } from './core/registry'
import { ACTION_ID } from '../actions/string-protocol/core/ids'
import { isActionSupported, type DeviceIdentity } from '../actions/string-protocol/core/action-support'

/**
 * String-Protocol variables aggregator.
 *
 * Responsibilities:
 *  - Build a `CompanionVariableDefinition[]` from the registry, filtered
 *    by the same per-action support matrix actions use. Definitions track
 *    the subset that survives device support so Companion only renders
 *    variables the current device can actually populate.
 *  - Install a `setVariableValues` hook that get-actions call to write
 *    values back; this is the single dispatch point so we can extend later
 *    (logging / change detection) without touching every callback.
 */

/**
 * Explicit map from protocol cmd short-code (matches REGISTRY_GROUPS) to the
 * ACTION_IDs that "support" it. A cmd's variables are registered iff at least
 * one of its ACTION_IDs is supported by the device.
 *
 * Why explicit: ACTION_ID values are user-visible labels (e.g.
 * `string_brightness_set`) and intentionally don't all follow the
 * `string_<cmd>_*` convention — names like `string_low_power_*`,
 * `string_sender_info_get`, `string_probe_layer_count_get` etc. would never
 * match a pattern derived from the cmd short-code. Using a typed map removes
 * the brittle string-pattern match (and its misspelling risk) and keeps the
 * relationship type-checked at compile time.
 *
 * Cmds whose ACTION_IDs only have a `_get` variant are query-only; cmds with
 * both `_set` and `_get` are bidirectional. The choice doesn't affect this
 * lookup — both shapes are valid here.
 */
const CMD_ACTION_IDS: Record<string, readonly ACTION_ID[]> = {
  // === Display / picture ===
  bright: [ACTION_ID.BRIGHT_SET, ACTION_ID.BRIGHT_GET],
  colortemp: [ACTION_ID.COLORTEMP_SET, ACTION_ID.COLORTEMP_GET],
  freeze: [ACTION_ID.FREEZE_SCREEN_SET, ACTION_ID.FREEZE_SCREEN_GET],
  blackout: [ACTION_ID.BLACKOUT_SET, ACTION_ID.BLACKOUT_GET],
  testmode: [ACTION_ID.TESTMODE_SET, ACTION_ID.TESTMODE_GET],
  hdrmode: [ACTION_ID.HDRMODE_SET, ACTION_ID.HDRMODE_GET],
  mute: [ACTION_ID.MUTE_SET, ACTION_ID.MUTE_GET],
  fade: [ACTION_ID.FADE_SET, ACTION_ID.FADE_GET],
  fadetime: [ACTION_ID.FADETIME_SET, ACTION_ID.FADETIME_GET],
  zerodelay: [ACTION_ID.ZERODELAY_SET, ACTION_ID.ZERODELAY_GET],
  uh5_st: [ACTION_ID.UH5_ST_SET, ACTION_ID.UH5_ST_GET],
  // pic_adj intentionally absent — see registry.ts comment.
  grp_hue: [ACTION_ID.HUE_SET, ACTION_ID.HUE_GET],
  grp_saturation: [ACTION_ID.SATURATION_SET, ACTION_ID.SATURATION_GET],
  grp_contrast: [ACTION_ID.CONTRAST_SET, ACTION_ID.CONTRAST_GET],
  grp_brtcomp: [ACTION_ID.BRTCOMP_SET, ACTION_ID.BRTCOMP_GET],

  // === Device ===
  sn: [ACTION_ID.SN_SET, ACTION_ID.SN_GET],

  // === Audio / 3D ===
  eye_switch: [ACTION_ID.EYE_SWITCH_SET, ACTION_ID.EYE_SWITCH_GET],
  mode3d: [ACTION_ID.MODE3D_SET, ACTION_ID.MODE3D_GET],
  dual_3d: [ACTION_ID.DUAL_3D_SET, ACTION_ID.DUAL_3D_GET],
  stereo_fmt: [ACTION_ID.STEREO_FMT_SET, ACTION_ID.STEREO_FMT_GET],

  // === Network port ===
  portout: [ACTION_ID.PORTOUT_SET, ACTION_ID.PORTOUT_GET],
  allports: [ACTION_ID.ALLPORTS_SET, ACTION_ID.ALLPORTS_GET],
  brt_port: [ACTION_ID.BRT_PORT_SET, ACTION_ID.BRT_PORT_GET],
  c_depth: [ACTION_ID.C_DEPTH_SET, ACTION_ID.C_DEPTH_GET],

  // === Layer ===
  layer: [ACTION_ID.LAYER_SET, ACTION_ID.LAYER_GET],
  layer_border: [ACTION_ID.LAYER_BORDER_SET, ACTION_ID.LAYER_BORDER_GET],
  bg_box: [ACTION_ID.BG_BOX_SET, ACTION_ID.BG_BOX_GET],

  // === Color / gain ===
  colorspace: [ACTION_ID.COLORSPACE_SET, ACTION_ID.COLORSPACE_GET],
  prec_mgr: [ACTION_ID.PREC_MGR_SET, ACTION_ID.PREC_MGR_GET],
  ct_r: [ACTION_ID.CT_R_SET, ACTION_ID.CT_R_GET],
  ct_g: [ACTION_ID.CT_G_SET, ACTION_ID.CT_G_GET],
  ct_b: [ACTION_ID.CT_B_SET, ACTION_ID.CT_B_GET],
  grp_gain: [ACTION_ID.GRP_GAIN_SET, ACTION_ID.GRP_GAIN_GET],
  virtual_pixel: [ACTION_ID.VIRTUAL_PIXEL_SET, ACTION_ID.VIRTUAL_PIXEL_GET],

  // === Device ===
  vsync_mul: [ACTION_ID.VSYNC_MUL_SET, ACTION_ID.VSYNC_MUL_GET],

  // === Frame rate / system / OSD ===
  framerate: [ACTION_ID.FRAMERATE_SET, ACTION_ID.FRAMERATE_GET],
  osd: [ACTION_ID.OSD_SET, ACTION_ID.OSD_GET],
  low_pwr: [ACTION_ID.LOW_PWR_SET, ACTION_ID.LOW_PWR_GET],

  // === Probe (query-only) ===
  sndinfo: [ACTION_ID.SNDINFO_GET],
  snd_eth: [ACTION_ID.SND_ETH_GET],
  pr_layer: [ACTION_ID.PR_LAYER_GET],
  pr_group: [ACTION_ID.PR_GROUP_GET],
  pr_video: [ACTION_ID.PR_VIDEO_GET],
  pr_vsync: [ACTION_ID.PR_VSYNC_GET],
  port_area: [ACTION_ID.PORT_AREA_GET],
  pr_video_count: [ACTION_ID.PR_VIDEO_COUNT_GET],

  // === Multi-function card ===
  mfc_probe: [ACTION_ID.MFC_PROBE_GET],
  rcv_probe: [ACTION_ID.RCV_PROBE_GET],
  mod_probe: [ACTION_ID.MOD_PROBE_GET],
  pr_rcv_state: [ACTION_ID.PR_RCV_STATE_GET]
}

/**
 * Decide whether a given cmd (e.g. `bright`) should expose its variables
 * for the device. Looks up the cmd's ACTION_IDs in `CMD_ACTION_IDS` and
 * requires at least one to be supported on the device.
 */
function isCmdSupported(cmd: string, device: DeviceIdentity): boolean {
  const ids = CMD_ACTION_IDS[cmd]
  if (!ids) return false
  for (const id of ids) {
    if (isActionSupported(id, device)) return true
  }
  return false
}

// === Self-check: every registry cmd must map to at least one ACTION_ID. ===
// A cmd in VARIABLE_GROUPS without an entry here would silently drop its
// variables from Companion — log once at module load so the regression is
// loud rather than invisible.
const REGISTRY_CMDS = new Set(VARIABLE_GROUPS.map((g) => g.cmd))
const UNMAPPED = [...REGISTRY_CMDS].filter((cmd) => !CMD_ACTION_IDS[cmd])
if (UNMAPPED.length > 0) {
  logger.warn(
    `variables: the following registry cmds have no ACTION_ID mapping and will never expose variables: ${UNMAPPED.join(', ')}`
  )
}

/**
 * Build the variable-definition list filtered by device support. Cmds that
 * aren't supported register no variables (so the user can't accidentally
 * observe stale data).
 */
function buildDefinitionsForDevice(device: DeviceIdentity): CompanionVariableDefinition[] {
  const out: CompanionVariableDefinition[] = []
  for (const g of VARIABLE_GROUPS) {
    if (!isCmdSupported(g.cmd, device)) {
      logger.debug(`variables: dropping cmd '${g.cmd}' (unsupported on protocol=${device.protocol})`)
      continue
    }
    for (const s of g.specs) {
      out.push({ variableId: s.variableId, name: s.displayName })
    }
  }
  return out
}

/**
 * Module-style installer: takes the InstanceBase (ProcessorBase subset)
 * and wires `setVariableDefinitions` for the supported subset. Returns a
 * stable `setVariableValues` function that get-actions can call to write
 * back values.
 *
 * Re-call this whenever the device identity changes (probe confirms a new
 * model, or the user re-configures the host) to refresh the definition set.
 */
export function setupVariables(context: ProcessorBase): {
  setVariableValues: (values: Record<string, number | string | boolean | object>) => void
  refresh: () => void
} {
  // Lazy bind to InstanceBase methods: the ProcessorBase type doesn't expose
  // setVariableDefinitions/setVariableValues directly, but the InstanceBase
  // runtime does. We cast through `unknown` to avoid widening the public
  // surface (these are Companion Module API methods, not application state).
  const ib = context as unknown as {
    setVariableDefinitions: (defs: CompanionVariableDefinition[]) => void
    setVariableValues: (values: Record<string, string | number | boolean | object>) => void
  }

  function applyDefinitions(): void {
    const defs = buildDefinitionsForDevice({
      protocol: context.config.protocol,
      modelByte: context.state.modelByte
    })
    try {
      ib.setVariableDefinitions(defs)
      logger.info(`Variables registered: ${defs.length} (modelByte=${context.state.modelByte ?? 'unresolved'})`)
    } catch (err) {
      logger.error(`setVariableDefinitions failed: ${(err as Error).message ?? String(err)}`)
    }
  }

  function setVariableValues(values: Record<string, number | string | boolean | object>): void {
    // The InstanceBase signature restricts values to string|number|boolean, but
    // composite variables (e.g. `layer: {layer, x, y, width, height}`) carry
    // nested objects which Companion preserves at runtime. Cast through unknown
    // to bridge the public type gap without changing the registry payload shape.
    try {
      ib.setVariableValues(values as unknown as Record<string, string | number | boolean>)
    } catch (err) {
      logger.warn(`setVariableValues failed: ${(err as Error).message ?? String(err)}`)
    }
  }

  // First install.
  applyDefinitions()

  return {
    setVariableValues,
    refresh: applyDefinitions
  }
}

export { VARIABLE_ID } from './core/ids'
