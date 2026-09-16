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
  cmd: string
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
}

/**
 * Single entry inside a RegistryGroup.
 *  - Flat: one protocol field → one variable value (number/string/bool).
 *  - Composite: many protocol fields → one object variable.
 */
type RegistryEntry =
  | { field: string; variableId: VARIABLE_ID; suffix?: string; key?: string }
  | { variableId: VARIABLE_ID; composite: Record<string, string> }

/** Group multiple variables under a single cmd by sharing the same `cmd` value. */
type RegistryGroup = {
  cmd: string
  entries: RegistryEntry[]
}

const REGISTRY_GROUPS: RegistryGroup[] = [
  // === Display / picture ===
  {
    cmd: 'bright',
    entries: [{ field: 'brt', variableId: VARIABLE_ID.BRIGHTNESS }]
  },
  {
    cmd: 'colortemp',
    entries: [{ field: 'ct', variableId: VARIABLE_ID.COLOR_TEMPERATURE }]
  },
  {
    cmd: 'freeze',
    entries: [{ field: 'en', variableId: VARIABLE_ID.FREEZE_ENABLE }]
  },
  {
    cmd: 'blackout',
    entries: [{ field: 'en', variableId: VARIABLE_ID.BLACKOUT_ENABLE }]
  },
  {
    cmd: 'testmode',
    entries: [{ field: 'tp', variableId: VARIABLE_ID.TESTMODE_PATTERN }]
  },
  {
    cmd: 'hdrmode',
    entries: [{ field: 'mode', variableId: VARIABLE_ID.HDRMODE }]
  },
  {
    cmd: 'mute',
    entries: [{ field: 'en', variableId: VARIABLE_ID.MUTE_ENABLE }]
  },
  {
    cmd: 'fade',
    entries: [{ field: 'en', variableId: VARIABLE_ID.FADE_ENABLE }]
  },
  {
    cmd: 'fadetime',
    entries: [{ field: 'ms', variableId: VARIABLE_ID.FADETIME_MS }]
  },
  {
    cmd: 'zerodelay',
    entries: [
      {
        variableId: VARIABLE_ID.ZERODELAY,
        composite: { enable: 'en', mode: 'mode' }
      }
    ]
  },
  {
    cmd: 'uh5_st',
    entries: [{ field: 'en', variableId: VARIABLE_ID.UH5_STATUS_ENABLE }]
  },

  // === Picture adjustment ===
  // `pic_adj` is intentionally absent: PIC_ADJ_GET writes into HUE /
  // SATURATION / CONTRAST / BRTCOMP_VALUE based on the response's `mode`
  // field. See src/actions/string-protocol/actions/picture.ts.
  {
    cmd: 'grp_hue',
    entries: [{ field: 'hue', variableId: VARIABLE_ID.HUE }]
  },
  {
    cmd: 'grp_saturation',
    entries: [{ field: 'sat', variableId: VARIABLE_ID.SATURATION }]
  },
  {
    cmd: 'grp_contrast',
    entries: [{ field: 'con', variableId: VARIABLE_ID.CONTRAST }]
  },
  {
    cmd: 'grp_brtcomp',
    entries: [{ field: 'bc', variableId: VARIABLE_ID.BRTCOMP_VALUE }]
  },

  // === Device ===
  {
    cmd: 'sn',
    entries: [{ field: 'serial', variableId: VARIABLE_ID.SERIAL_NUMBER }]
  },

  // === Audio / 3D ===
  {
    cmd: 'eye_switch',
    entries: [{ field: 'eye', variableId: VARIABLE_ID.EYE_SWITCH_EYE }]
  },
  {
    cmd: 'mode3d',
    entries: [{ field: 'en', variableId: VARIABLE_ID.MODE3D_ENABLE }]
  },
  {
    cmd: 'dual_3d',
    entries: [{ field: 'mode', variableId: VARIABLE_ID.DUAL_3D_MODE }]
  },
  {
    cmd: 'stereo_fmt',
    entries: [{ field: 'fmt', variableId: VARIABLE_ID.STEREO_FORMAT }]
  },

  // === Network port ===
  {
    cmd: 'portout',
    entries: [
      {
        variableId: VARIABLE_ID.PORTOUT,
        composite: { port: 'port', enable: 'en' }
      }
    ]
  },
  {
    cmd: 'allports',
    entries: [{ field: 'en', variableId: VARIABLE_ID.ALLPORTS_ENABLE }]
  },
  {
    cmd: 'brt_port',
    entries: [
      {
        variableId: VARIABLE_ID.BRT_PORT,
        composite: { port: 'port', brightness: 'brt' }
      }
    ]
  },
  {
    cmd: 'c_depth',
    entries: [{ field: 'depth', variableId: VARIABLE_ID.C_DEPTH_BITS }]
  },

  // === Layer ===
  // Composite: a single `layer` variable holds the full layer geometry.
  // Object keys: { layer (index), x, y, width, height } — sourced from
  // the protocol fields { layer, x, y, w, h }.
  {
    cmd: 'layer',
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
    cmd: 'layer_border',
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
    cmd: 'bg_box',
    entries: [
      {
        variableId: VARIABLE_ID.BG_BOX,
        composite: { width: 'w', height: 'h' }
      }
    ]
  },

  // === Color / gain ===
  {
    cmd: 'colorspace',
    entries: [{ field: 'space', variableId: VARIABLE_ID.COLORSPACE }]
  },
  {
    cmd: 'prec_mgr',
    entries: [{ field: 'en', variableId: VARIABLE_ID.PREC_MGR_ENABLE }]
  },
  {
    cmd: 'ct_r',
    entries: [{ field: 'r', variableId: VARIABLE_ID.CT_R_VALUE }]
  },
  {
    cmd: 'ct_g',
    entries: [{ field: 'g', variableId: VARIABLE_ID.CT_G_VALUE }]
  },
  {
    cmd: 'ct_b',
    entries: [{ field: 'b', variableId: VARIABLE_ID.CT_B_VALUE }]
  },
  {
    cmd: 'grp_gain',
    entries: [{ field: 'gain', variableId: VARIABLE_ID.GRP_GAIN_VALUE }]
  },
  {
    cmd: 'virtual_pixel',
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
    cmd: 'vsync_mul',
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
    cmd: 'framerate',
    entries: [{ field: 'mode', variableId: VARIABLE_ID.FRAMERATE_MODE }]
  },
  {
    cmd: 'osd',
    entries: [{ field: 'en', variableId: VARIABLE_ID.OSD_ENABLE }]
  },
  {
    cmd: 'low_pwr',
    entries: [{ field: 'en', variableId: VARIABLE_ID.LOW_PWR_ENABLE }]
  },

  // === Probe (query-only) ===
  {
    cmd: 'sndinfo',
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
    cmd: 'snd_eth',
    entries: [
      {
        variableId: VARIABLE_ID.SND_ETH,
        composite: { count: 'n', ports: 'ports' }
      }
    ]
  },
  {
    cmd: 'pr_layer',
    entries: [
      {
        variableId: VARIABLE_ID.PR_LAYER,
        composite: { gid: 'gid', layer_count: 'layerCount' }
      }
    ]
  },
  {
    cmd: 'pr_group',
    entries: [
      {
        variableId: VARIABLE_ID.PR_GROUP,
        composite: { count: 'groupCount', ids: 'groupIds' }
      }
    ]
  },
  {
    cmd: 'pr_video',
    entries: [
      {
        variableId: VARIABLE_ID.PR_VIDEO,
        composite: { total: 'srcTotal', sources: 'sources' }
      }
    ]
  },
  {
    cmd: 'pr_vsync',
    entries: [
      {
        variableId: VARIABLE_ID.PR_VSYNC,
        composite: { gid: 'gid', scaled100: 'scaled100', scaled10000: 'scaled10000' }
      }
    ]
  },
  {
    cmd: 'port_area',
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
    cmd: 'pr_video_count',
    entries: [{ field: 'count', variableId: VARIABLE_ID.PR_VIDEO_COUNT }]
  },
  {
    cmd: 'mfc_probe',
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
    cmd: 'rcv_probe',
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
    cmd: 'mod_probe',
    entries: [
      {
        variableId: VARIABLE_ID.MOD_PROBE,
        composite: { port: 'port', modules: 'modules' }
      }
    ]
  },
  {
    cmd: 'pr_rcv_state',
    entries: [
      {
        variableId: VARIABLE_ID.PR_RCV_STATE,
        composite: { port: 'port', modules: 'modules' }
      }
    ]
  }
]

/** Per-cmd display-name overrides (the user-visible noun for the cmd). */
const CMD_DISPLAY: Record<string, string> = {
  bright: 'Brightness',
  colortemp: 'Color Temperature',
  freeze: 'Freeze',
  blackout: 'Blackout',
  testmode: 'Test Pattern',
  hdrmode: 'HDR Mode',
  mute: 'Mute',
  fade: 'Fade',
  fadetime: 'Fade Time',
  zerodelay: 'Zero Delay',
  uh5_st: 'UH5 Status',
  pic_adj: 'Picture Adjust',
  grp_hue: 'Hue',
  grp_saturation: 'Saturation',
  grp_contrast: 'Contrast',
  grp_brtcomp: 'Brightness Compensation',
  sn: 'Serial Number',
  eye_switch: 'Eye Switch',
  mode3d: '3D Mode',
  dual_3d: 'Dual 3D',
  stereo_fmt: 'Stereo Format',
  portout: 'Network Port Output',
  allports: 'All Network Ports',
  brt_port: 'Network Port Brightness',
  c_depth: 'Screen Group Output Color Depth',
  layer: 'Layer Position/Size',
  layer_border: 'Layer Border',
  bg_box: 'Background Box',
  colorspace: 'Color Space',
  prec_mgr: 'Precise Color Manager',
  ct_r: 'Color Temp Red Gain',
  ct_g: 'Color Temp Green Gain',
  ct_b: 'Color Temp Blue Gain',
  grp_gain: 'Group Intensity Gain',
  virtual_pixel: 'Virtual Pixel',
  vsync_mul: 'VSYNC Multiplier',
  framerate: 'Frame Rate',
  osd: 'OSD',
  low_pwr: 'Low Power',
  sndinfo: 'Sender Info',
  snd_eth: 'Sender Ethernet Ports',
  pr_layer: 'Screen Layer Count',
  pr_group: 'Screen Group Count',
  pr_video: 'Video Input Signals',
  pr_vsync: 'VSYNC Info',
  port_area: 'Port Control Area',
  pr_video_count: 'Video Input Count',
  mfc_probe: 'Multi-Function Card',
  rcv_probe: 'Receiver Card',
  mod_probe: 'Module',
  pr_rcv_state: 'Recv Module State'
}

/**
 * Compute the user-facing display name for a registry entry. Multi-field
 * entries (`key` defined) use the per-entry suffix; single-field entries
 * inherit the cmd-level display name.
 */
function buildDisplayName(cmdDisplay: string, suffix?: string): string {
  return suffix ? `${cmdDisplay} (${suffix})` : cmdDisplay
}

/** Build a flat registry: list of specs grouped by cmd. */
export interface CmdVariableGroup {
  cmd: string
  specs: VariableSpec[]
}

function buildGroups(): CmdVariableGroup[] {
  const out: CmdVariableGroup[] = []
  for (const g of REGISTRY_GROUPS) {
    const displayName = CMD_DISPLAY[g.cmd] ?? g.cmd
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
        displayName: buildDisplayName(displayName, e.suffix),
        key: e.key
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
 *  - Flat specs: number/string/bool → as-is; arrays/objects →
 *    JSON-serialized for the text-only fallback path.
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
      out[spec.variableId] = v
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
