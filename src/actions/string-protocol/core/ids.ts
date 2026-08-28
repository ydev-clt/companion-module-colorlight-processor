/**
 * String-Protocol Action / Feedback id constants.
 *
 * Used for:
 *  - Keys returned by setupActions
 *  - References from state.triggerFeedbacks(FEEDBACK_ID.X)
 *  - Central entrypoints for connection-level actions like heartbeat/cmdlist
 */

export enum ACTION_ID {
  // === Connection maintenance ===
  HEARTBEAT = 'string_heartbeat',
  CMDLIST = 'string_cmdlist',

  // === Display / picture ===
  BRIGHT = 'string_brightness',
  COLORTEMP = 'string_colortemp',
  FREEZE_SCREEN = 'string_freeze',
  BLACKOUT = 'string_blackout',
  TESTMODE = 'string_testmode',
  HDRMODE = 'string_hdrmode',
  MUTE = 'string_mute',
  FADE = 'string_fade',
  FADETIME = 'string_fadetime',
  ZERODELAY = 'string_zerodelay',
  UH5_ST = 'string_uh5_status',

  // === Picture adjustment (pic_adj + equivalent dedicated commands) ===
  PIC_ADJ = 'string_picture_adjust',
  HUE = 'string_hue',
  SATURATION = 'string_saturation',
  CONTRAST = 'string_contrast',
  BRTCOMP = 'string_brtcomp',

  // === Preset ===
  QUICK_PRESET = 'string_quick_preset',
  SAVE_PRESET = 'string_save_preset',
  LOAD_PRESET = 'string_load_preset',
  RENAME_PRESET = 'string_rename_preset',

  // === Layer ===
  LAYER = 'string_layer',
  LAYER_BORDER = 'string_layer_border',
  BG_BOX = 'string_bg_box',
  LAYER_ORDER = 'string_layer_order',
  DEL_LAYER = 'string_del_layer',
  CLEAR_LAYER = 'string_clear_layer',

  // === Network port ===
  PORTOUT = 'string_portout',
  ALLPORTS = 'string_allports',
  BRT_PORT = 'string_port_brightness',
  C_DEPTH = 'string_color_depth',
  NET_BRT_EN = 'string_net_brightness_enable',

  // === Color / gain ===
  COLORSPACE = 'string_colorspace',
  PREC_MGR = 'string_precision_color_mgr',
  CT_R = 'string_ct_r',
  CT_G = 'string_ct_g',
  CT_B = 'string_ct_b',
  GRP_GAIN = 'string_group_gain',
  VIRTUAL_PIXEL = 'string_virtual_pixel',

  // === Audio / 3D ===
  EYE_SWITCH = 'string_eye_switch',
  MODE3D = 'string_mode3d',
  DUAL_3D = 'string_dual_3d',
  STEREO_FMT = 'string_stereo_fmt',

  // === Device ===
  SN = 'string_serial_number',
  EDID_SET = 'string_edid_set',
  BRT_RELA = 'string_brightness_relative',
  CT_RELA = 'string_colortemp_relative',
  BRT_STEP = 'string_brightness_step',
  VSYNC_MUL = 'string_vsync_multiplier',

  // === Frame rate / system ===
  FRAMERATE = 'string_framerate',
  FPS_ADAPT = 'string_fps_adapt',
  OSD = 'string_osd',
  LOW_PWR = 'string_low_power',

  // === Probe (query-only) ===
  SNDINFO = 'string_sender_info',
  SND_ETH = 'string_sender_eth',
  PR_LAYER = 'string_probe_layer_count',
  PR_GROUP = 'string_probe_group_count',
  PR_VIDEO = 'string_probe_video_input',
  PR_VSYNC = 'string_probe_vsync',
  PORT_AREA = 'string_probe_port_control_area',
  PR_VIDEO_COUNT = 'string_probe_video_count',

  // === Multi-function card ===
  MFC_PROBE = 'string_mfc_probe',
  RCV_PROBE = 'string_receiver_probe',
  MOD_PROBE = 'string_module_probe',
  MFC_MANUAL = 'string_mfc_relay_manual',
  MFC_AUTO = 'string_mfc_relay_auto',
  B_CURVE = 'string_brightness_curve',
  PR_RCV_STATE = 'string_probe_recv_state',

  // === Audio preset ===
  LD_AUDPRESET_ID = 'string_load_audio_preset_id',
  LD_AUDPRESET_IDX = 'string_load_audio_preset_index',

  // === Dangerous operations ===
  RESTOREHOST = 'string_restore_host',
  REBOOT = 'string_reboot',
  SHUTDOWN = 'string_shutdown',

  // === Custom ===
  RAW_COMMAND = 'string_raw_command'
}

export enum FEEDBACK_ID {
  FREEZE_SCREEN = 'string_freeze_feedback',
  BLACKOUT = 'string_blackout_feedback',
  BRIGHTNESS = 'string_brightness_feedback'
}
