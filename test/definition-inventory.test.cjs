const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ACTION_ID } = require('../dist/actions/string-protocol/core/ids')
const { FEEDBACK_ID } = require('../dist/common/feedback-ids')
const { VARIABLE_ID } = require('../dist/variables/core/ids')

/**
 * Saved Companion buttons refer to these strings. A refactor must not rename
 * or silently drop one; update this snapshot only when intentionally adding a
 * definition.
 */
const ACTION_IDS = [
  'string_allports_set',
  'string_bg_box_set',
  'string_blackout_set',
  'string_brightness_relative',
  'string_brightness_set',
  'string_brightness_step',
  'string_brtcomp_set',
  'string_canvas_switch_mode_set',
  'string_clear_layer',
  'string_color_depth_set',
  'string_colorspace_set',
  'string_colortemp_relative',
  'string_colortemp_set',
  'string_contrast_set',
  'string_ct_b_set',
  'string_ct_g_set',
  'string_ct_r_set',
  'string_cut',
  'string_del_layer',
  'string_dual_3d_set',
  'string_edid_set',
  'string_eye_switch_set',
  'string_fade_set',
  'string_fadetime_set',
  'string_fps_adapt',
  'string_framerate_set',
  'string_freeze_set',
  'string_group_gain_set',
  'string_hdrmode_set',
  'string_hue_set',
  'string_layer_border_set',
  'string_layer_order',
  'string_layer_set',
  'string_load_audio_preset_index',
  'string_load_preset',
  'string_low_gray_set',
  'string_low_power_set',
  'string_mfc_relay_manual',
  'string_mode3d_set',
  'string_mute_set',
  'string_net_brightness_enable',
  'string_osd_set',
  'string_picture_adjust_set',
  'string_port_brightness_set',
  'string_portout_set',
  'string_precision_color_mgr_set',
  'string_quick_preset',
  'string_raw_command',
  'string_reboot',
  'string_rename_preset',
  'string_saturation_set',
  'string_save_preset',
  'string_serial_number_set',
  'string_shutdown',
  'string_stereo_fmt_set',
  'string_take',
  'string_testmode_set',
  'string_uh5_status_set',
  'string_videosrc_set',
  'string_virtual_pixel_set',
  'string_vsync_multiplier_set',
  'string_vsync_src_set',
  'string_zerodelay_set'
]

const FEEDBACK_IDS = ['string_blackout_feedback', 'string_freeze_feedback', 'string_low_gray_feedback']

const VARIABLE_IDS = [
  '3d_enable',
  '3d_eye_priority',
  '3d_signal_format',
  'allports_enable',
  'background_box',
  'blackout_enable',
  'brightness',
  'brightness_compensation',
  'canvas_mode',
  'canvas_switch_mode',
  'color_temperature',
  'colorspace',
  'contrast',
  'dual_3d_mode',
  'fade_enable',
  'fadetime_ms',
  'framerate_mode',
  'freeze_enable',
  'gama',
  'hdrmode',
  'hue',
  'layer',
  'layer_border',
  'low_gray_enable',
  'low_pwr_enable',
  'module_probe',
  'multi_function_card',
  'mute_enable',
  'osd_enable',
  'output_frame_rate',
  'port_brightness',
  'port_control_area',
  'port_output',
  'pr_video_count',
  'precise_color_management_enable',
  'receiver_card',
  'recv_module_state',
  'saturation',
  'screen_color_depth',
  'screen_color_temperature_b',
  'screen_color_temperature_g',
  'screen_color_temperature_r',
  'screen_group_count',
  'screen_intensity_gain',
  'screen_layer_count',
  'sender_ethernet',
  'sender_info',
  'serial_number',
  'testmode_pattern',
  'uh5_enable',
  'video_board',
  'virtual_pixel',
  'vsync_info',
  'vsync_multiplier',
  'vsync_src',
  'zerodelay'
]

test('action ids are stable', () => {
  assert.deepEqual(Object.values(ACTION_ID).sort(), ACTION_IDS)
})

test('feedback ids are stable', () => {
  assert.deepEqual(Object.values(FEEDBACK_ID).sort(), FEEDBACK_IDS)
})

test('variable ids are stable', () => {
  assert.deepEqual(Object.values(VARIABLE_ID).sort(), VARIABLE_IDS)
})
