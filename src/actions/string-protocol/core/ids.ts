/**
 * String-Protocol Action / Feedback id constants.
 *
 * Naming convention:
 *  - Set actions: `string_<cmd>_set`, or a set-only id without that suffix.
 *  - Set-only cmds (reboot, edid_set, ...) only have the set variant.
 *
 * Used for:
 *  - Keys returned by setupActions
 *  - References from state.triggerFeedbacks(FEEDBACK_ID.X)
 *  - Central entrypoints for connection-level actions like heartbeat/cmdlist
 */

export enum ACTION_ID {
  // === Display / picture ===
  BRIGHT_SET = 'string_brightness_set',
  COLORTEMP_SET = 'string_colortemp_set',
  FREEZE_SCREEN_SET = 'string_freeze_set',
  BLACKOUT_SET = 'string_blackout_set',
  TESTMODE_SET = 'string_testmode_set',
  HDRMODE_SET = 'string_hdrmode_set',
  MUTE_SET = 'string_mute_set',
  FADE_SET = 'string_fade_set',
  FADETIME_SET = 'string_fadetime_set',
  ZERODELAY_SET = 'string_zerodelay_set',
  UH5_ST_SET = 'string_uh5_status_set',

  // === Picture adjustment ===
  PIC_ADJ_SET = 'string_picture_adjust_set',
  HUE_SET = 'string_hue_set',
  SATURATION_SET = 'string_saturation_set',
  CONTRAST_SET = 'string_contrast_set',
  BRTCOMP_SET = 'string_brtcomp_set',

  // === Preset ===
  QUICK_PRESET = 'string_quick_preset',
  SAVE_PRESET = 'string_save_preset',
  LOAD_PRESET = 'string_load_preset',
  RENAME_PRESET = 'string_rename_preset',

  // === Layer ===
  LAYER_SET = 'string_layer_set',
  LAYER_BORDER_SET = 'string_layer_border_set',
  BG_BOX_SET = 'string_bg_box_set',
  LAYER_ORDER = 'string_layer_order',
  DEL_LAYER = 'string_del_layer',
  CLEAR_LAYER = 'string_clear_layer',

  // === Network port ===
  PORTOUT_SET = 'string_portout_set',
  ALLPORTS_SET = 'string_allports_set',
  BRT_PORT_SET = 'string_port_brightness_set',
  C_DEPTH_SET = 'string_color_depth_set',
  NET_BRT_EN = 'string_net_brightness_enable',

  // === Color / gain ===
  COLORSPACE_SET = 'string_colorspace_set',
  PREC_MGR_SET = 'string_precision_color_mgr_set',
  CT_R_SET = 'string_ct_r_set',
  CT_G_SET = 'string_ct_g_set',
  CT_B_SET = 'string_ct_b_set',
  GRP_GAIN_SET = 'string_group_gain_set',
  VIRTUAL_PIXEL_SET = 'string_virtual_pixel_set',

  // === Audio / 3D ===
  EYE_SWITCH_SET = 'string_eye_switch_set',
  MODE3D_SET = 'string_mode3d_set',
  DUAL_3D_SET = 'string_dual_3d_set',
  STEREO_FMT_SET = 'string_stereo_fmt_set',

  // === Device ===
  SN_SET = 'string_serial_number_set',
  EDID_SET = 'string_edid_set',
  BRT_RELA = 'string_brightness_relative',
  CT_RELA = 'string_colortemp_relative',
  BRT_STEP = 'string_brightness_step',
  VSYNC_MUL_SET = 'string_vsync_multiplier_set',

  // === Frame rate / system ===
  FRAMERATE_SET = 'string_framerate_set',
  FPS_ADAPT = 'string_fps_adapt',
  OSD_SET = 'string_osd_set',
  LOW_PWR_SET = 'string_low_power_set',

  // === Multi-function card ===
  MFC_MANUAL = 'string_mfc_relay_manual',

  // === Audio preset ===
  LD_AUDPRESET_IDX = 'string_load_audio_preset_index',

  // === Dangerous operations ===
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
