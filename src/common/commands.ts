/**
 * Protocol command short codes (§4.3 command summary).
 *
 * This is the single runtime and type-level list shared by the action,
 * support, variable and polling layers. Values correspond one-to-one with the
 * protocol `cmd` field.
 */
export const CMD = {
  BRIGHT: 'bright',
  HEARTBEAT: 'heartbeat',
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
  VIDEOSRC: 'videosrc',
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
  PR_CANVAS: 'pr_canvas',
  PR_VIDEO: 'pr_video',
  PR_VIN_BOARD: 'pr_vin_board',
  PR_VSYNC: 'pr_vsync',
  PORT_AREA: 'port_area',
  PR_VIDEO_COUNT: 'pr_video_count',
  MFC_PROBE: 'mfc_probe',
  RCV_PROBE: 'rcv_probe',
  MOD_PROBE: 'mod_probe',
  MFC_MANUAL: 'mfc_manual',
  LOW_PWR: 'low_pwr',
  PR_RCV_STATE: 'pr_rcv_state',
  REBOOT: 'reboot',
  SHUTDOWN: 'shutdown',
  OSD: 'osd',
  FRAMERATE: 'framerate',
  FPS_ADAPT: 'fps_adapt',
  LD_AUDPRESET_IDX: 'ld_audpreset_idx',
  LOW_GRAY: 'low_gray',
  TAKE: 'take',
  CUT: 'cut',
  CANVAS_SWITCH_MODE: 'canvas_switch_mode',
  CANVAS_MODE: 'canvas_mode',
  OUT_FPS: 'out_fps',
  VSYNC_SRC: 'vsync_src',
  COMM_OBJ: 'comm_obj'
} as const

/** Every command short code the module knows about. */
export type Cmd = (typeof CMD)[keyof typeof CMD]

/** Runtime list of command short codes, used by catalog completeness checks. */
export const ALL_CMDS: readonly Cmd[] = Object.values(CMD)

const CMD_SET = new Set<string>(ALL_CMDS)

/** Whether a protocol string is one of the known command short codes. */
export function isCmd(value: string): value is Cmd {
  return CMD_SET.has(value)
}
