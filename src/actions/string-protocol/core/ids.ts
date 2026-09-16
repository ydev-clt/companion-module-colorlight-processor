/**
 * String-Protocol Action / Feedback id constants.
 *
 * Naming convention:
 *  - Set actions: `string_<cmd>_set`
 *  - Get actions: `string_<cmd>_get`
 *  - Each cmd that supports both get and set gets two ids; the set action
 *    sends the request and the get action sends the same request with the
 *    get op and writes the response data into variables.
 *  - Query-only cmds (sndinfo, pr_layer, etc.) only have the get variant.
 *  - Set-only cmds (reboot, edid_set, ...) only have the set variant.
 *
 * Used for:
 *  - Keys returned by setupActions
 *  - References from state.triggerFeedbacks(FEEDBACK_ID.X)
 *  - Central entrypoints for connection-level actions like heartbeat/cmdlist
 */

export enum ACTION_ID {
  // === Connection maintenance (set-only side effects) ===
  HEARTBEAT = 'string_heartbeat_set',
  CMDLIST = 'string_cmdlist_get',

  // === Display / picture ===
  BRIGHT_SET = 'string_brightness_set',
  BRIGHT_GET = 'string_brightness_get',
  COLORTEMP_SET = 'string_colortemp_set',
  COLORTEMP_GET = 'string_colortemp_get',
  FREEZE_SCREEN_SET = 'string_freeze_set',
  FREEZE_SCREEN_GET = 'string_freeze_get',
  BLACKOUT_SET = 'string_blackout_set',
  BLACKOUT_GET = 'string_blackout_get',
  TESTMODE_SET = 'string_testmode_set',
  TESTMODE_GET = 'string_testmode_get',
  HDRMODE_SET = 'string_hdrmode_set',
  HDRMODE_GET = 'string_hdrmode_get',
  MUTE_SET = 'string_mute_set',
  MUTE_GET = 'string_mute_get',
  FADE_SET = 'string_fade_set',
  FADE_GET = 'string_fade_get',
  FADETIME_SET = 'string_fadetime_set',
  FADETIME_GET = 'string_fadetime_get',
  ZERODELAY_SET = 'string_zerodelay_set',
  ZERODELAY_GET = 'string_zerodelay_get',
  UH5_ST_SET = 'string_uh5_status_set',
  UH5_ST_GET = 'string_uh5_status_get',

  // === Picture adjustment ===
  PIC_ADJ_SET = 'string_picture_adjust_set',
  PIC_ADJ_GET = 'string_picture_adjust_get',
  HUE_SET = 'string_hue_set',
  HUE_GET = 'string_hue_get',
  SATURATION_SET = 'string_saturation_set',
  SATURATION_GET = 'string_saturation_get',
  CONTRAST_SET = 'string_contrast_set',
  CONTRAST_GET = 'string_contrast_get',
  BRTCOMP_SET = 'string_brtcomp_set',
  BRTCOMP_GET = 'string_brtcomp_get',

  // === Preset ===
  QUICK_PRESET = 'string_quick_preset',
  SAVE_PRESET = 'string_save_preset',
  LOAD_PRESET = 'string_load_preset',
  RENAME_PRESET = 'string_rename_preset',

  // === Layer ===
  LAYER_SET = 'string_layer_set',
  LAYER_GET = 'string_layer_get',
  LAYER_BORDER_SET = 'string_layer_border_set',
  LAYER_BORDER_GET = 'string_layer_border_get',
  BG_BOX_SET = 'string_bg_box_set',
  BG_BOX_GET = 'string_bg_box_get',
  LAYER_ORDER = 'string_layer_order',
  DEL_LAYER = 'string_del_layer',
  CLEAR_LAYER = 'string_clear_layer',

  // === Network port ===
  PORTOUT_SET = 'string_portout_set',
  PORTOUT_GET = 'string_portout_get',
  ALLPORTS_SET = 'string_allports_set',
  ALLPORTS_GET = 'string_allports_get',
  BRT_PORT_SET = 'string_port_brightness_set',
  BRT_PORT_GET = 'string_port_brightness_get',
  C_DEPTH_SET = 'string_color_depth_set',
  C_DEPTH_GET = 'string_color_depth_get',
  NET_BRT_EN = 'string_net_brightness_enable',

  // === Color / gain ===
  COLORSPACE_SET = 'string_colorspace_set',
  COLORSPACE_GET = 'string_colorspace_get',
  PREC_MGR_SET = 'string_precision_color_mgr_set',
  PREC_MGR_GET = 'string_precision_color_mgr_get',
  CT_R_SET = 'string_ct_r_set',
  CT_R_GET = 'string_ct_r_get',
  CT_G_SET = 'string_ct_g_set',
  CT_G_GET = 'string_ct_g_get',
  CT_B_SET = 'string_ct_b_set',
  CT_B_GET = 'string_ct_b_get',
  GRP_GAIN_SET = 'string_group_gain_set',
  GRP_GAIN_GET = 'string_group_gain_get',
  VIRTUAL_PIXEL_SET = 'string_virtual_pixel_set',
  VIRTUAL_PIXEL_GET = 'string_virtual_pixel_get',

  // === Audio / 3D ===
  EYE_SWITCH_SET = 'string_eye_switch_set',
  EYE_SWITCH_GET = 'string_eye_switch_get',
  MODE3D_SET = 'string_mode3d_set',
  MODE3D_GET = 'string_mode3d_get',
  DUAL_3D_SET = 'string_dual_3d_set',
  DUAL_3D_GET = 'string_dual_3d_get',
  STEREO_FMT_SET = 'string_stereo_fmt_set',
  STEREO_FMT_GET = 'string_stereo_fmt_get',

  // === Device ===
  SN_SET = 'string_serial_number_set',
  SN_GET = 'string_serial_number_get',
  EDID_SET = 'string_edid_set',
  BRT_RELA = 'string_brightness_relative',
  CT_RELA = 'string_colortemp_relative',
  BRT_STEP = 'string_brightness_step',
  VSYNC_MUL_SET = 'string_vsync_multiplier_set',
  VSYNC_MUL_GET = 'string_vsync_multiplier_get',

  // === Frame rate / system ===
  FRAMERATE_SET = 'string_framerate_set',
  FRAMERATE_GET = 'string_framerate_get',
  FPS_ADAPT = 'string_fps_adapt',
  OSD_SET = 'string_osd_set',
  OSD_GET = 'string_osd_get',
  LOW_PWR_SET = 'string_low_power_set',
  LOW_PWR_GET = 'string_low_power_get',

  // === Probe (query-only; only the get variant exists) ===
  SNDINFO_GET = 'string_sender_info_get',
  SND_ETH_GET = 'string_sender_eth_get',
  PR_LAYER_GET = 'string_probe_layer_count_get',
  PR_GROUP_GET = 'string_probe_group_count_get',
  PR_VIDEO_GET = 'string_probe_video_input_get',
  PR_VSYNC_GET = 'string_probe_vsync_get',
  PORT_AREA_GET = 'string_probe_port_control_area_get',
  PR_VIDEO_COUNT_GET = 'string_probe_video_count_get',

  // === Multi-function card ===
  MFC_PROBE_GET = 'string_mfc_probe_get',
  RCV_PROBE_GET = 'string_receiver_probe_get',
  MOD_PROBE_GET = 'string_module_probe_get',
  MFC_MANUAL = 'string_mfc_relay_manual',
  MFC_AUTO = 'string_mfc_relay_auto',
  B_CURVE = 'string_brightness_curve',
  PR_RCV_STATE_GET = 'string_probe_recv_state_get',

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
