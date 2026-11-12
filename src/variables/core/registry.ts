import { CMD, type Cmd } from '../../common/commands'
import { VARIABLE_ID } from './ids'

/**
 * Variable registry.
 *
 * Each entry defines:
 *  - cmd: the protocol command short-code that backs the variable
 *  - field: which key inside `data` is exposed
 *  - displayName: shown to the user as the Companion variable name
 *  - key (optional): when one cmd exposes multiple fields, used as the
 *    unique discriminator inside `extractValues`
 */

export interface VariableSpec {
  /** Stable Companion variableId (see VARIABLE_ID). */
  variableId: VARIABLE_ID
  /** Protocol cmd that supplies the value. */
  cmd: Cmd
  /**
   * Single protocol field whose value becomes the variable value
   * (mutually exclusive with `composite`).
   */
  field?: string
  /** Human-readable label shown in the Companion UI. */
  displayName: string
  /**
   * Discriminator for cmds with multiple flat variables (e.g. `virtual_pixel`).
   * When two flat entries share the same `cmd`, their `key` values must differ.
   * For cmds with a single exposed field, leave `key` undefined.
   */
  key?: string
  /**
   * Compose an object variable from multiple protocol fields.
   * Map of object-key → protocol-field-name (e.g. `{ width: 'w' }`).
   * The resulting object becomes the variable's value verbatim; no JSON
   * serialization. Mutually exclusive with `field`.
   */
  composite?: Record<string, string>
  /**
   * When set, a finite numeric `field` is stored as `transform(value)`.
   * Composite specs ignore this.
   */
  transform?: (value: number) => number
}

/**
 * Single entry inside a RegistryGroup.
 *  - Flat: one protocol field → one variable value (number/string/bool).
 *  - Composite: many protocol fields → one object variable.
 */
type RegistryEntry =
  | {
      field: string
      variableId: VARIABLE_ID
      suffix?: string
      key?: string
      transform?: (value: number) => number
    }
  | { variableId: VARIABLE_ID; composite: Record<string, string> }

/** Group multiple variables under a single cmd by sharing the same `cmd` value. */
type RegistryGroup = {
  cmd: Cmd
  entries: RegistryEntry[]
}

/** Protocol raw units (0–10000) to a percentage number with two decimal places. */
function percentFromRaw(value: number): number {
  return Number((value / 100).toFixed(2))
}

const REGISTRY_GROUPS: RegistryGroup[] = [
  // === Display / picture ===
  {
    cmd: CMD.BRIGHT,
    entries: [{ field: 'brt', variableId: VARIABLE_ID.BRIGHTNESS, transform: percentFromRaw }]
  },
  {
    cmd: CMD.COLORTEMP,
    entries: [{ field: 'ct', variableId: VARIABLE_ID.COLOR_TEMPERATURE }]
  },
  {
    cmd: CMD.FREEZE,
    entries: [{ field: 'en', variableId: VARIABLE_ID.FREEZE_ENABLE }]
  },
  {
    cmd: CMD.BLACKOUT,
    entries: [{ field: 'en', variableId: VARIABLE_ID.BLACKOUT_ENABLE }]
  },
  {
    cmd: CMD.TESTMODE,
    entries: [{ field: 'tp', variableId: VARIABLE_ID.TESTMODE_PATTERN }]
  },
  {
    cmd: CMD.HDRMODE,
    entries: [{ field: 'mode', variableId: VARIABLE_ID.HDRMODE }]
  },
  {
    cmd: CMD.MUTE,
    entries: [{ field: 'en', variableId: VARIABLE_ID.MUTE_ENABLE }]
  },
  {
    cmd: CMD.FADE,
    entries: [{ field: 'en', variableId: VARIABLE_ID.FADE_ENABLE }]
  },
  {
    cmd: CMD.FADETIME,
    entries: [{ field: 'ms', variableId: VARIABLE_ID.FADETIME_MS }]
  },
  {
    cmd: CMD.ZERODELAY,
    entries: [
      {
        variableId: VARIABLE_ID.ZERODELAY,
        composite: { enable: 'en', mode: 'mode' }
      }
    ]
  },
  {
    cmd: CMD.UH5_ST,
    entries: [{ field: 'en', variableId: VARIABLE_ID.UH5_STATUS_ENABLE }]
  },

  // === Picture adjustment ===
  // `pic_adj` is intentionally absent: PIC_ADJ_GET writes into HUE /
  // SATURATION / CONTRAST / BRTCOMP_VALUE based on the response's `mode`
  // field. See src/actions/string-protocol/actions/picture.ts.
  {
    cmd: CMD.GRP_HUE,
    entries: [{ field: 'hue', variableId: VARIABLE_ID.HUE }]
  },
  {
    cmd: CMD.GRP_SATURATION,
    entries: [{ field: 'sat', variableId: VARIABLE_ID.SATURATION }]
  },
  {
    cmd: CMD.GRP_CONTRAST,
    entries: [{ field: 'con', variableId: VARIABLE_ID.CONTRAST }]
  },
  {
    cmd: CMD.GRP_BRTCOMP,
    entries: [{ field: 'bc', variableId: VARIABLE_ID.BRTCOMP_VALUE }]
  },

  // === Device ===
  {
    cmd: CMD.SN,
    entries: [{ field: 'serial', variableId: VARIABLE_ID.SERIAL_NUMBER }]
  },

  // === Audio / 3D ===
  {
    cmd: CMD.EYE_SWITCH,
    entries: [{ field: 'eye', variableId: VARIABLE_ID.EYE_SWITCH_EYE }]
  },
  {
    cmd: CMD.MODE3D,
    entries: [{ field: 'en', variableId: VARIABLE_ID.MODE3D_ENABLE }]
  },
  {
    cmd: CMD.DUAL_3D,
    entries: [{ field: 'mode', variableId: VARIABLE_ID.DUAL_3D_MODE }]
  },
  {
    cmd: CMD.STEREO_FMT,
    entries: [{ field: 'fmt', variableId: VARIABLE_ID.STEREO_FORMAT }]
  },

  // === Network port ===
  {
    cmd: CMD.PORTOUT,
    entries: [
      {
        variableId: VARIABLE_ID.PORTOUT,
        composite: { port: 'port', enable: 'en' }
      }
    ]
  },
  {
    cmd: CMD.ALLPORTS,
    entries: [{ field: 'en', variableId: VARIABLE_ID.ALLPORTS_ENABLE }]
  },
  {
    cmd: CMD.BRT_PORT,
    entries: [
      {
        variableId: VARIABLE_ID.BRT_PORT,
        composite: { port: 'port', brightness: 'brt' }
      }
    ]
  },
  {
    cmd: CMD.C_DEPTH,
    entries: [{ field: 'depth', variableId: VARIABLE_ID.C_DEPTH_BITS }]
  },

  // === Layer ===
  // Composite: a single `layer` variable holds the full layer geometry.
  // Object keys: { layer (index), x, y, width, height } — sourced from
  // the protocol fields { layer, x, y, w, h }.
  {
    cmd: CMD.LAYER,
    entries: [
      {
        variableId: VARIABLE_ID.LAYER,
        composite: {
          layer: 'layer',
          x: 'x',
          y: 'y',
          width: 'w',
          height: 'h'
        }
      }
    ]
  },
  {
    cmd: CMD.LAYER_BORDER,
    entries: [
      {
        variableId: VARIABLE_ID.LAYER_BORDER,
        composite: {
          layer: 'layer',
          enable: 'en',
          opacity: 'opacity',
          width: 'width',
          r: 'r',
          g: 'g',
          b: 'b'
        }
      }
    ]
  },
  {
    cmd: CMD.BG_BOX,
    entries: [
      {
        variableId: VARIABLE_ID.BG_BOX,
        composite: { width: 'w', height: 'h' }
      }
    ]
  },

  // === Color / gain ===
  {
    cmd: CMD.COLORSPACE,
    entries: [{ field: 'space', variableId: VARIABLE_ID.COLORSPACE }]
  },
  {
    cmd: CMD.PREC_MGR,
    entries: [{ field: 'en', variableId: VARIABLE_ID.PREC_MGR_ENABLE }]
  },
  {
    cmd: CMD.CT_R,
    entries: [{ field: 'r', variableId: VARIABLE_ID.CT_R_VALUE, transform: percentFromRaw }]
  },
  {
    cmd: CMD.CT_G,
    entries: [{ field: 'g', variableId: VARIABLE_ID.CT_G_VALUE, transform: percentFromRaw }]
  },
  {
    cmd: CMD.CT_B,
    entries: [{ field: 'b', variableId: VARIABLE_ID.CT_B_VALUE, transform: percentFromRaw }]
  },
  {
    cmd: CMD.GRP_GAIN,
    entries: [{ field: 'gain', variableId: VARIABLE_ID.GRP_GAIN_VALUE }]
  },
  {
    cmd: CMD.VIRTUAL_PIXEL,
    entries: [
      {
        variableId: VARIABLE_ID.VIRTUAL_PIXEL,
        composite: {
          enable: 'en',
          rate: 'rate',
          direction: 'direction',
          row_offset: 'rowOffset',
          col_offset: 'colOffset'
        }
      }
    ]
  },

  // === Device ===
  {
    cmd: CMD.VSYNC_MUL,
    entries: [
      {
        variableId: VARIABLE_ID.VSYNC_MUL,
        composite: {
          enable: 'en',
          method: 'method',
          multiplier: 'mul'
        }
      }
    ]
  },

  // === Frame rate / system / OSD ===
  {
    cmd: CMD.FRAMERATE,
    entries: [{ field: 'mode', variableId: VARIABLE_ID.FRAMERATE_MODE }]
  },
  {
    cmd: CMD.OSD,
    entries: [{ field: 'en', variableId: VARIABLE_ID.OSD_ENABLE }]
  },
  {
    cmd: CMD.LOW_PWR,
    entries: [{ field: 'en', variableId: VARIABLE_ID.LOW_PWR_ENABLE }]
  },
  {
    cmd: CMD.LOW_GRAY,
    entries: [{ field: 'en', variableId: VARIABLE_ID.LOW_GRAY_ENABLE }]
  },
  {
    cmd: CMD.CANVAS_MODE,
    entries: [{ field: 'mode', variableId: VARIABLE_ID.CANVAS_MODE }]
  },
  {
    cmd: CMD.CANVAS_SWITCH_MODE,
    entries: [{ field: 'switchMode', variableId: VARIABLE_ID.CANVAS_SWITCH_MODE }]
  },
  {
    cmd: CMD.OUT_FPS,
    entries: [{ field: 'fps10000', variableId: VARIABLE_ID.OUTPUT_FRAME_RATE }]
  },
  {
    cmd: CMD.VSYNC_SRC,
    entries: [{ field: 'src', variableId: VARIABLE_ID.VSYNC_SRC }]
  },

  // === Probe (query-only) ===
  {
    cmd: CMD.SNDINFO,
    entries: [
      {
        variableId: VARIABLE_ID.SNDINFO,
        composite: {
          model: 'model',
          version: 'ver',
          brightness: 'brt',
          color_temp: 'ct',
          temperature: 'temp',
          blackout: 'black',
          freeze: 'freeze',
          test_pattern: 'tp',
          ports: 'ports'
        }
      }
    ]
  },
  {
    cmd: CMD.SND_ETH,
    entries: [
      {
        variableId: VARIABLE_ID.SND_ETH,
        composite: { count: 'n', ports: 'ports' }
      }
    ]
  },
  {
    cmd: CMD.PR_LAYER,
    entries: [
      {
        variableId: VARIABLE_ID.PR_LAYER,
        composite: { gid: 'gid', layer_count: 'layerCount' }
      }
    ]
  },
  {
    cmd: CMD.PR_GROUP,
    entries: [
      {
        variableId: VARIABLE_ID.PR_GROUP,
        composite: { count: 'groupCount', ids: 'groupIds' }
      }
    ]
  },
  {
    cmd: CMD.PR_VIDEO,
    entries: [
      {
        variableId: VARIABLE_ID.PR_VIDEO,
        composite: { total: 'srcTotal', sources: 'sources' }
      }
    ]
  },
  {
    cmd: CMD.PR_VSYNC,
    entries: [
      {
        variableId: VARIABLE_ID.PR_VSYNC,
        composite: { gid: 'gid', scaled100: 'scaled100', scaled10000: 'scaled10000' }
      }
    ]
  },
  {
    cmd: CMD.PORT_AREA,
    entries: [
      {
        variableId: VARIABLE_ID.PORT_AREA,
        composite: {
          gid: 'gid',
          port_count: 'port_count',
          ports: 'ports',
          xs: 'xs',
          ys: 'ys',
          ws: 'ws',
          hs: 'hs'
        }
      }
    ]
  },
  {
    cmd: CMD.PR_VIDEO_COUNT,
    entries: [{ field: 'count', variableId: VARIABLE_ID.PR_VIDEO_COUNT }]
  },
  {
    cmd: CMD.MFC_PROBE,
    entries: [
      {
        variableId: VARIABLE_ID.MFC_PROBE,
        composite: {
          port: 'port',
          card_count: 'cardCount',
          temperature: 'temp',
          hardware_version: 'hwVer',
          software_version: 'swVer'
        }
      }
    ]
  },
  {
    cmd: CMD.RCV_PROBE,
    entries: [
      {
        variableId: VARIABLE_ID.RCV_PROBE,
        composite: {
          port: 'port',
          rcv: 'rcv',
          card_type: 'type',
          width: 'w',
          height: 'h',
          linked: 'linked',
          runtime: 'runtime',
          version: 'ver'
        }
      }
    ]
  },
  {
    cmd: CMD.MOD_PROBE,
    entries: [
      {
        variableId: VARIABLE_ID.MOD_PROBE,
        composite: { port: 'port', modules: 'modules' }
      }
    ]
  },
  {
    cmd: CMD.PR_RCV_STATE,
    entries: [
      {
        variableId: VARIABLE_ID.PR_RCV_STATE,
        composite: { port: 'port', modules: 'modules' }
      }
    ]
  }
]

/**
 * Per-cmd display override. `name` is the user-visible noun for the cmd;
 * `description` describes what each value of the variable means
 * (e.g. `enable (0: off, 1: on)`). Pure numeric-range fields are intentionally
 * omitted per project convention.
 */
export interface CmdDisplay {
  /** The user-visible label shown in the Companion UI. */
  name: string
  /** Field-value semantics; concatenated after the variable name in the UI. */
  description?: string
}

const CMD_DISPLAY: Record<string, CmdDisplay> = {
  bright: { name: 'Brightness' },
  colortemp: { name: 'Color Temperature' },
  freeze: { name: 'Freeze', description: 'freeze_enable (0: off, 1: freeze)' },
  blackout: { name: 'Blackout', description: 'blackout_enable (0: off, 1: blackout)' },
  testmode: {
    name: 'Test Pattern',
    description: 'testmode_pattern (0: off, other: built-in test pattern index)'
  },
  hdrmode: {
    name: 'HDR Mode',
    description:
      'hdrmode (0: off, 1: auto, 2: HDR10 Rec.2020, 3: HDR10 DCI-P3, 4: HDR10 Rec.709, 5: HLG Rec.2020, 6: HLG DCI-P3, 7: HLG Rec.709)'
  },
  mute: { name: 'Mute', description: 'mute_enable (0: off, 1: muted)' },
  fade: { name: 'Fade', description: 'fade_enable (0: off, 1: on)' },
  fadetime: { name: 'Fade Time' },
  zerodelay: {
    name: 'Zero Delay',
    description: 'zerodelay.enable (0: off, 1: on), zerodelay.mode (1: 0-frame, 2: 1-frame)'
  },
  uh5_st: { name: 'UH5 Status', description: 'uh5_enable (0: off, 1: on)' },
  pic_adj: { name: 'Picture Adjust' },
  grp_hue: { name: 'Hue' },
  grp_saturation: { name: 'Saturation' },
  grp_contrast: { name: 'Contrast' },
  grp_brtcomp: { name: 'Brightness Compensation' },
  sn: { name: 'Serial Number' },
  eye_switch: { name: 'Eye Switch', description: '3d_eye_priority (0: left eye, 1: right eye)' },
  mode3d: { name: '3D Mode', description: '3d_enable (0: off, 1: on)' },
  dual_3d: { name: 'Dual 3D', description: 'dual_3d_mode (0: single 3D, 1: dual 3D)' },
  stereo_fmt: {
    name: 'Stereo Format',
    description: '3d_signal_format (0: side-by-side / top-and-bottom, 1: frame sequential)'
  },
  portout: { name: 'Network Port Output', description: 'port_output.enable (0: off, 1: on)' },
  allports: { name: 'All Network Ports', description: 'allports_enable (0: off, 1: on)' },
  brt_port: { name: 'Network Port Brightness' },
  c_depth: {
    name: 'Screen Group Output Color Depth',
    description: 'screen_color_depth (8: 8-bit, 10: 10-bit, 12: 12-bit)'
  },
  layer: { name: 'Layer Position/Size' },
  layer_border: {
    name: 'Layer Border',
    description: 'layer_border.enable (0: off, 1: on); layer_border.layer (1-based index)'
  },
  bg_box: { name: 'Background Box' },
  colorspace: {
    name: 'Color Space',
    description:
      'colorspace (0: native, 1: sRGB, 2: Adobe RGB, 3: PAL, 4: NTSC, 5: Rec.601, 6: Rec.709, 7: Rec.2020, 8: DCI-P3)'
  },
  prec_mgr: { name: 'Precise Color Manager', description: 'precise_color_management_enable (0: off, 1: on)' },
  ct_r: { name: 'Color Temp Red Gain' },
  ct_g: { name: 'Color Temp Green Gain' },
  ct_b: { name: 'Color Temp Blue Gain' },
  grp_gain: { name: 'Group Intensity Gain' },
  virtual_pixel: {
    name: 'Virtual Pixel',
    description:
      'virtual_pixel.enable (0: off, 1: on), virtual_pixel.rate (1: 4x virtual, 2: 3x virtual, 3: 0.75 virtual), virtual_pixel.direction (0: left to right, 1: top to bottom), virtual_pixel.row_offset (0: off, 1: on), virtual_pixel.col_offset (0: off, 1: on)'
  },
  vsync_mul: {
    name: 'VSYNC Multiplier',
    description:
      'vsync_multiplier.enable (0: off, 1: on), vsync_multiplier.method (0: auto, 1: specify multiplier), vsync_multiplier.multiplier (0: off, 1: 2x, ..., 9: 10x)'
  },
  framerate: {
    name: 'Frame Rate',
    description: 'framerate_mode (0: off, 1: auto, 2: fixed, 3: scene fusion, 4: 3D)'
  },
  osd: { name: 'OSD', description: 'osd_enable (0: off, 1: on)' },
  low_pwr: { name: 'Low Power', description: 'low_pwr_enable (0: off, 1: on)' },
  low_gray: { name: 'Low-Brightness High-Gray', description: 'low_gray_enable (0: off, 1: on)' },
  canvas_mode: { name: 'Canvas Mode', description: 'canvas_mode (0: normal, 1: switcher)' },
  canvas_switch_mode: {
    name: 'Canvas Switch Mode',
    description: 'canvas_switch_mode (0: copy, 1: swap)'
  },
  out_fps: { name: 'Output Frame Rate', description: 'output_frame_rate (Hz)' },
  vsync_src: {
    name: 'Video Sync Source',
    description: 'vsync_src (0: input board/signal, 1: Genlock, 2: internal, 3: auto lock, 4: ODCK)'
  },
  sndinfo: {
    name: 'Sender Info',
    description:
      'sender_info.blackout (0: off, 1: blackout), sender_info.freeze (0: off, 1: freeze), sender_info.test_pattern (0: off, other: built-in test pattern index)'
  },
  snd_eth: { name: 'Sender Ethernet Ports' },
  pr_layer: { name: 'Screen Layer Count' },
  pr_group: { name: 'Screen Group Count' },
  pr_video: { name: 'Video Input Signals' },
  pr_vsync: { name: 'VSYNC Info' },
  port_area: { name: 'Port Control Area' },
  pr_video_count: { name: 'Video Input Count' },
  mfc_probe: { name: 'Multi-Function Card' },
  rcv_probe: { name: 'Receiver Card' },
  mod_probe: { name: 'Module' },
  pr_rcv_state: { name: 'Recv Module State' }
}

/**
 * Compute the user-facing display name for a registry entry. Multi-field
 * entries (`key` defined) use the per-entry suffix; single-field entries
 * inherit the cmd-level display name. The optional `description` is appended
 * in parentheses so the UI shows both the label and what each value means.
 */
function buildDisplayName(cmdDisplay: CmdDisplay, suffix?: string): string {
  const label = cmdDisplay.name + (cmdDisplay.description ? ` (${cmdDisplay.description})` : '')
  return suffix ? `${label} (${suffix})` : label
}

/** Build a flat registry: list of specs grouped by cmd. */
export interface CmdVariableGroup {
  cmd: string
  specs: VariableSpec[]
}

function buildGroups(): CmdVariableGroup[] {
  const out: CmdVariableGroup[] = []
  for (const g of REGISTRY_GROUPS) {
    const cmdDisplay: CmdDisplay = CMD_DISPLAY[g.cmd] ?? { name: g.cmd }
    const displayName = cmdDisplay.name + (cmdDisplay.description ? ` (${cmdDisplay.description})` : '')
    const specs: VariableSpec[] = g.entries.map((e): VariableSpec => {
      if ('composite' in e) {
        return {
          cmd: g.cmd,
          variableId: e.variableId,
          displayName,
          composite: e.composite
        }
      }
      return {
        cmd: g.cmd,
        field: e.field,
        variableId: e.variableId,
        displayName: buildDisplayName(cmdDisplay, e.suffix),
        key: e.key,
        transform: e.transform
      }
    })
    out.push({ cmd: g.cmd, specs })
  }
  return out
}

export const VARIABLE_GROUPS: ReadonlyArray<CmdVariableGroup> = buildGroups()

/** Index by variableId for fast lookup from action callbacks. */
const SPEC_BY_VAR_ID = new Map<string, VariableSpec>()
for (const g of VARIABLE_GROUPS) {
  for (const s of g.specs) {
    SPEC_BY_VAR_ID.set(s.variableId as string, s)
  }
}
export function getSpecByVariableId(id: string): VariableSpec | undefined {
  return SPEC_BY_VAR_ID.get(id)
}

/** Index by cmd for the get-action side. */
const SPECS_BY_CMD = new Map<string, VariableSpec[]>()
for (const g of VARIABLE_GROUPS) {
  SPECS_BY_CMD.set(g.cmd, g.specs)
}
export function getSpecsByCmd(cmd: string): VariableSpec[] {
  return SPECS_BY_CMD.get(cmd) ?? []
}

/**
 * Extract values for a given cmd's response data, returning a map of
 * variableId → Companion value (number / string / object).
 *
 * Rules:
 *  - Composite specs: build an object from the listed protocol fields.
 *    The object is written verbatim — Companion preserves nested values
 *    at runtime, even though the public API types list only
 *    `string | number | boolean`.
 *  - Flat specs: a finite number with `transform` is stored as
 *    `transform(value)`; `NaN` and `Infinity` on a transformed field are
 *    skipped; untransformed numbers, strings, and booleans stay as they
 *    are; arrays/objects → JSON-serialized for the text-only fallback path.
 *  - Missing fields are skipped (no entry in the returned map).
 */
export function extractValuesForCmd(cmd: string, data: unknown): Record<string, number | string | object> {
  const specs = getSpecsByCmd(cmd)
  if (!specs.length) return {}
  if (data === null || data === undefined || typeof data !== 'object') return {}

  const obj = data as Record<string, unknown>
  const out: Record<string, number | string | object> = {}
  for (const spec of specs) {
    // Composite: build an object from multiple protocol fields.
    if (spec.composite) {
      const built: Record<string, unknown> = {}
      for (const [objKey, fieldName] of Object.entries(spec.composite)) {
        const v = obj[fieldName]
        if (v === undefined || v === null) continue
        built[objKey] = v
      }
      if (Object.keys(built).length > 0) {
        out[spec.variableId] = built
      }
      continue
    }

    // Flat: pull a single field from the response.
    if (!spec.field) continue
    const v = obj[spec.field]
    if (v === undefined || v === null) continue
    if (typeof v === 'number') {
      if (spec.transform) {
        if (!Number.isFinite(v)) continue
        out[spec.variableId] = spec.transform(v)
      } else {
        out[spec.variableId] = v
      }
    } else if (typeof v === 'string') {
      out[spec.variableId] = v
    } else if (typeof v === 'boolean') {
      out[spec.variableId] = v ? 1 : 0
    } else {
      // arrays / objects on a flat spec: serialize for display.
      try {
        out[spec.variableId] = JSON.stringify(v)
      } catch {
        // ignore unserializable payloads
      }
    }
  }
  return out
}

/** Quick lookup of all variableIds defined here, for completeness checks. */
export const ALL_VARIABLE_IDS: ReadonlyArray<VARIABLE_ID> = VARIABLE_GROUPS.flatMap((g) =>
  g.specs.map((s) => s.variableId)
)
