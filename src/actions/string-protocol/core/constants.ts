/**
 * String-Protocol constants.
 *
 * Includes:
 *  - Frame delimiters (§4.2.1)
 *  - Device addressing conventions (§4.2.5 sid / §2 gid)
 *  - Global protocol error codes (§Appendix C)
 *  - Full command short-code set (§4.3 + §5)
 *  - Recommended heartbeat parameters (§5.1)
 */

/**
 * Frame delimiters.
 *  The JSON payload must be enclosed by `<` and `>` (§4.2.1).
 */
export const FRAME_LEFT_DELIMITER = '<' as const
export const FRAME_RIGHT_DELIMITER = '>' as const

/**
 * SID value conventions.
 *  - 1-254: a single sender id (§4.2.5)
 *  - 255: broadcast (only valid for devices that support USB cascading)
 */
export const SID_MIN = 1
export const SID_MAX_UNICAST = 254
export const SID_BROADCAST = 255

/**
 * GID value conventions.
 *  - Default 1; fill with the actual value for multi-screen-group setups (§2).
 */
export const GID_DEFAULT = 1

/**
 * Protocol-supported op values (§4.2.4).
 */
export const OP = {
  GET: 'get',
  SET: 'set'
} as const

/**
 * Global protocol error codes (§Appendix C).
 */
export const PROTOCOL_CODE = {
  /** Success */
  SUCCESS: 0,
  /** Invalid JSON format */
  INVALID_JSON: 9001,
  /** Missing frame delimiters */
  MISSING_DELIMITER: 9002,
  /** Root element is not an array */
  ROOT_NOT_ARRAY: 9003,
  /** Array is empty */
  EMPTY_ARRAY: 9004,
  /** Array element is not an object */
  ELEMENT_NOT_OBJECT: 9005,
  /** Device not found */
  DEVICE_NOT_FOUND: 9006,
  /** Timeout */
  TIMEOUT: 9007,
  /** Invalid parameter */
  INVALID_PARAMS: 9008,
  /** Missing required parameter */
  MISSING_REQUIRED: 9009,
  /** Command not supported */
  CMD_UNSUPPORTED: 9010,
  /** Parameter out of capability range */
  PARAMS_OUT_OF_CAPABILITY: 9011,
  /** Unknown error */
  UNKNOWN: 9999
} as const

/**
 * Protocol command short-code constants (§4.3 command summary).
 *  - Values correspond one-to-one with the protocol `cmd` field.
 */
export const CMD = {
  HEARTBEAT: 'heartbeat',
  CMDLIST: 'cmdlist',
  BRIGHT: 'bright',
  COLORTEMP: 'colortemp',
  FREEZE: 'freeze',
  BLACKOUT: 'blackout',
  PIC_ADJ: 'pic_adj',
  SN: 'sn',
  HDRMODE: 'hdrmode',
  QP: 'qp',
  SVPRESET: 'svpreset',
  LDPRESET: 'ldpreset',
  MODE3D: 'mode3d',
  DUAL_3D: 'dual_3d',
  STEREO_FMT: 'stereo_fmt',
  COLORSPACE: 'colorspace',
  PORTOUT: 'portout',
  ALLPORTS: 'allports',
  LAYER: 'layer',
  LAYER_BORDER: 'layer_border',
  BG_BOX: 'bg_box',
  BRT_PORT: 'brt_port',
  C_DEPTH: 'c_depth',
  EDID_SET: 'edid_set',
  EYE_SWITCH: 'eye_switch',
  GRP_BRTCOMP: 'grp_brtcomp',
  LAYERORDER: 'layerorder',
  DELLAYER: 'dellayer',
  CLEAR_LAYER: 'clear_layer',
  FADE: 'fade',
  FADETIME: 'fadetime',
  NET_BRT_EN: 'net_brt_en',
  ZERODELAY: 'zerodelay',
  GRP_GAIN: 'grp_gain',
  PREC_MGR: 'prec_mgr',
  CT_R: 'ct_r',
  CT_G: 'ct_g',
  CT_B: 'ct_b',
  UH5_ST: 'uh5_st',
  TESTMODE: 'testmode',
  GRP_HUE: 'grp_hue',
  GRP_SATURATION: 'grp_saturation',
  GRP_CONTRAST: 'grp_contrast',
  MUTE: 'mute',
  VIRTUAL_PIXEL: 'virtual_pixel',
  RPNAME: 'rpname',
  BRT_RELA: 'brt_rela',
  CT_RELA: 'ct_rela',
  BRT_STEP: 'brt_step',
  VSYNC_MUL: 'vsync_mul',
  SNDINFO: 'sndinfo',
  SND_ETH: 'snd_eth',
  PR_LAYER: 'pr_layer',
  PR_GROUP: 'pr_group',
  PR_VIDEO: 'pr_video',
  PR_VSYNC: 'pr_vsync',
  PORT_AREA: 'port_area',
  PR_VIDEO_COUNT: 'pr_video_count',
  MFC_PROBE: 'mfc_probe',
  RCV_PROBE: 'rcv_probe',
  MOD_PROBE: 'mod_probe',
  MFC_MANUAL: 'mfc_manual',
  MFC_AUTO: 'mfc_auto',
  B_CURVE: 'b_curve',
  LOW_PWR: 'low_pwr',
  PR_RCV_STATE: 'pr_rcv_state',
  RESTOREHOST: 'restorehost',
  REBOOT: 'reboot',
  SHUTDOWN: 'shutdown',
  OSD: 'osd',
  FRAMERATE: 'framerate',
  FPS_ADAPT: 'fps_adapt',
  LD_AUDPRESET_ID: 'ld_audpreset_id',
  LD_AUDPRESET_IDX: 'ld_audpreset_idx'
} as const

/**
 * Recommended heartbeat interval / reconnect / transaction ID ranges (§5.1.1 + transaction id §2).
 */
export const STRING_HEARTBEAT_MIN_MS = 5_000
export const STRING_HEARTBEAT_MAX_MS = 30_000
export const STRING_HEARTBEAT_DEFAULT_MS = 10_000

/** Per-transaction id upper bound (uint32). */
export const TRANSACTION_ID_MAX = 0xffffffff
