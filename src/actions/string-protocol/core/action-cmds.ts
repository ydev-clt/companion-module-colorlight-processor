import { ACTION_ID } from './ids'

/**
 * Maps each registered action to the protocol command used for set-support
 * checks. `'always'` stays registered on every device, including an
 * unresolved model. A missing entry is not registered.
 */
export const ACTION_CMD: Record<ACTION_ID, string | 'always'> = {
  // === Display / picture ===
  [ACTION_ID.BRIGHT_SET]: 'bright',
  [ACTION_ID.COLORTEMP_SET]: 'colortemp',
  [ACTION_ID.FREEZE_SCREEN_SET]: 'freeze',
  [ACTION_ID.BLACKOUT_SET]: 'blackout',
  [ACTION_ID.TESTMODE_SET]: 'testmode',
  [ACTION_ID.HDRMODE_SET]: 'hdrmode',
  [ACTION_ID.MUTE_SET]: 'mute',
  [ACTION_ID.FADE_SET]: 'fade',
  [ACTION_ID.FADETIME_SET]: 'fadetime',
  [ACTION_ID.ZERODELAY_SET]: 'zerodelay',
  [ACTION_ID.UH5_ST_SET]: 'uh5_st',

  // === Picture adjustment ===
  [ACTION_ID.PIC_ADJ_SET]: 'pic_adj',
  [ACTION_ID.HUE_SET]: 'grp_hue',
  [ACTION_ID.SATURATION_SET]: 'grp_saturation',
  [ACTION_ID.CONTRAST_SET]: 'grp_contrast',
  [ACTION_ID.BRTCOMP_SET]: 'grp_brtcomp',

  // === Preset ===
  [ACTION_ID.QUICK_PRESET]: 'qp',
  [ACTION_ID.SAVE_PRESET]: 'svpreset',
  [ACTION_ID.LOAD_PRESET]: 'ldpreset',
  [ACTION_ID.RENAME_PRESET]: 'rpname',

  // === Layer ===
  [ACTION_ID.LAYER_SET]: 'layer',
  [ACTION_ID.LAYER_BORDER_SET]: 'layer_border',
  [ACTION_ID.BG_BOX_SET]: 'bg_box',
  [ACTION_ID.LAYER_ORDER]: 'layerorder',
  [ACTION_ID.DEL_LAYER]: 'dellayer',
  [ACTION_ID.CLEAR_LAYER]: 'clear_layer',

  // === Network port ===
  [ACTION_ID.PORTOUT_SET]: 'portout',
  [ACTION_ID.ALLPORTS_SET]: 'allports',
  [ACTION_ID.BRT_PORT_SET]: 'brt_port',
  [ACTION_ID.C_DEPTH_SET]: 'c_depth',
  [ACTION_ID.NET_BRT_EN]: 'net_brt_en',

  // === Color / gain ===
  [ACTION_ID.COLORSPACE_SET]: 'colorspace',
  [ACTION_ID.PREC_MGR_SET]: 'prec_mgr',
  [ACTION_ID.CT_R_SET]: 'ct_r',
  [ACTION_ID.CT_G_SET]: 'ct_g',
  [ACTION_ID.CT_B_SET]: 'ct_b',
  [ACTION_ID.GRP_GAIN_SET]: 'grp_gain',
  [ACTION_ID.VIRTUAL_PIXEL_SET]: 'virtual_pixel',

  // === Audio / 3D ===
  [ACTION_ID.EYE_SWITCH_SET]: 'eye_switch',
  [ACTION_ID.MODE3D_SET]: 'mode3d',
  [ACTION_ID.DUAL_3D_SET]: 'dual_3d',
  [ACTION_ID.STEREO_FMT_SET]: 'stereo_fmt',

  // === Device ===
  [ACTION_ID.SN_SET]: 'sn',
  [ACTION_ID.EDID_SET]: 'edid_set',
  [ACTION_ID.BRT_RELA]: 'brt_rela',
  [ACTION_ID.CT_RELA]: 'ct_rela',
  [ACTION_ID.BRT_STEP]: 'brt_step',
  [ACTION_ID.VSYNC_MUL_SET]: 'vsync_mul',

  // === Frame rate / system ===
  [ACTION_ID.FRAMERATE_SET]: 'framerate',
  [ACTION_ID.FPS_ADAPT]: 'fps_adapt',
  [ACTION_ID.OSD_SET]: 'osd',
  [ACTION_ID.LOW_PWR_SET]: 'low_pwr',

  // === Multi-function card ===
  [ACTION_ID.MFC_MANUAL]: 'mfc_manual',

  // === Audio preset ===
  [ACTION_ID.LD_AUDPRESET_IDX]: 'ld_audpreset_idx',

  // === Dangerous operations ===
  [ACTION_ID.REBOOT]: 'reboot',
  [ACTION_ID.SHUTDOWN]: 'shutdown',

  // === Canvas / sync ===
  [ACTION_ID.LOW_GRAY_SET]: 'low_gray',
  [ACTION_ID.TAKE]: 'take',
  [ACTION_ID.CUT]: 'cut',
  [ACTION_ID.CANVAS_SWITCH_MODE_SET]: 'canvas_switch_mode',
  [ACTION_ID.VSYNC_SRC_SET]: 'vsync_src',

  // === Custom ===
  [ACTION_ID.RAW_COMMAND]: 'always'
}
