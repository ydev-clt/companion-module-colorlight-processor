/**
 * String-Protocol Variable id constants.
 *
 * Each Variable id is the human-friendly identifier used in `setVariableDefinitions`.
 *
 * Naming rules:
 *  - No `string_` prefix (per project convention for user-visible variables).
 *  - Single-field cmds: variableId is just the descriptive name
 *    (e.g. `freeze_enable`, `brightness`).
 *  - Multi-field cmds: a single composite variable holds an object built
 *    from the response fields. Keys inside the object are full words
 *    (e.g. `zerodelay: { enable, mode }`, `layer_border: { layer, enable, opacity, width, r, g, b }`).
 *  - `en` → `enable`, `brt` → `brightness`, `ms` → `milliseconds`,
 *    `mul` → `multiplier`, `ver` → `version`, `temp` → `temperature`.
 *
 * These ids are stable across the module lifecycle; values are updated via
 * `setVariableValues`.
 */

export enum VARIABLE_ID {
  // === Display / picture (single-field) ===
  BRIGHTNESS = 'brightness',
  COLOR_TEMPERATURE = 'color_temperature',
  FREEZE_ENABLE = 'freeze_enable',
  BLACKOUT_ENABLE = 'blackout_enable',
  TESTMODE_PATTERN = 'testmode_pattern',
  HDRMODE = 'hdrmode',
  MUTE_ENABLE = 'mute_enable',
  FADE_ENABLE = 'fade_enable',
  FADETIME_MS = 'fadetime_ms',
  UH5_STATUS_ENABLE = 'uh5_enable',

  // === Display / picture (composite) ===
  // `zerodelay: { enable, mode }`
  ZERODELAY = 'zerodelay',

  // === Picture adjustment ===
  // Note: PIC_ADJ_GET writes into HUE / SATURATION / CONTRAST / BRTCOMP_VALUE
  // based on the returned mode field; no dedicated pic_adj_mode/value vars.
  HUE = 'hue',
  SATURATION = 'saturation',
  CONTRAST = 'contrast',
  BRTCOMP_VALUE = 'brightness_compensation',
  GAMA = 'gama',

  // === Device ===
  SERIAL_NUMBER = 'serial_number',

  // === Audio / 3D ===
  EYE_SWITCH_EYE = '3d_eye_priority',
  MODE3D_ENABLE = '3d_enable',
  DUAL_3D_MODE = 'dual_3d_mode',
  STEREO_FORMAT = '3d_signal_format',

  // === Network port (composite) ===
  // `port_output: { port, enable }`
  PORTOUT = 'port_output',
  ALLPORTS_ENABLE = 'allports_enable',
  // `port_brightness: { port, brightness }`
  BRT_PORT = 'port_brightness',
  C_DEPTH_BITS = 'screen_color_depth',

  // === Layer (composite) ===
  // `layer: { layer, x, y, width, height }` — already in place.
  LAYER = 'layer',
  // `layer_border: { layer, enable, opacity, width, r, g, b }`
  LAYER_BORDER = 'layer_border',
  // `background_box: { width, height }`
  BG_BOX = 'background_box',

  // === Color / gain ===
  COLORSPACE = 'colorspace',
  PREC_MGR_ENABLE = 'precise_color_management_enable',
  CT_R_VALUE = 'screen_color_temperature_r',
  CT_G_VALUE = 'screen_color_temperature_g',
  CT_B_VALUE = 'screen_color_temperature_b',
  GRP_GAIN_VALUE = 'screen_intensity_gain',
  // `virtual_pixel: { enable, rate, direction, row_offset, col_offset }`
  VIRTUAL_PIXEL = 'virtual_pixel',

  // === Device ===
  // `vsync_multiplier: { enable, method, multiplier }`
  VSYNC_MUL = 'vsync_multiplier',

  // === Frame rate / system / OSD ===
  FRAMERATE_MODE = 'framerate_mode',
  OSD_ENABLE = 'osd_enable',
  LOW_PWR_ENABLE = 'low_pwr_enable',

  // === Probe (query-only; composite) ===
  // `sender_info: { model, version, brightness, color_temp, temperature, blackout, freeze, test_pattern, ports }`
  SNDINFO = 'sender_info',
  // `sender_ethernet: { count, ports }`
  SND_ETH = 'sender_ethernet',
  // `screen_layer_count: { gid, layer_count }`
  PR_LAYER = 'screen_layer_count',
  // `screen_group_count: { count, ids }`
  PR_GROUP = 'screen_group_count',
  // `video_board: { total, sources }`
  PR_VIDEO = 'video_board',
  // `vsync_info: { gid, scaled100, scaled10000 }`
  PR_VSYNC = 'vsync_info',
  // `port_control_area: { gid, port_count, ports, xs, ys, ws, hs }`
  PORT_AREA = 'port_control_area',
  PR_VIDEO_COUNT = 'pr_video_count',
  // `multi_function_card: { port, card_count, temperature, hardware_version, software_version }`
  MFC_PROBE = 'multi_function_card',
  // `receiver_card: { port, rcv, card_type, width, height, linked, runtime, version }`
  RCV_PROBE = 'receiver_card',
  // `module_probe: { port, modules }`
  MOD_PROBE = 'module_probe',
  // `recv_module_state: { port, modules }`
  PR_RCV_STATE = 'recv_module_state'
}
