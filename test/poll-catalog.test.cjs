const { test } = require('node:test')
const assert = require('node:assert/strict')
const { POLL_CATALOG, selectPollRequests, projectPollData } = require('../dist/variables/initial/catalog')

const initialScreen = [
  'bright', 'colortemp', 'freeze', 'blackout', 'testmode', 'hdrmode', 'mute', 'fade', 'fadetime', 'zerodelay',
  'grp_hue', 'grp_saturation', 'grp_contrast', 'grp_brtcomp', 'bg_box', 'c_depth', 'colorspace', 'prec_mgr',
  'ct_r', 'ct_g', 'ct_b', 'grp_gain', 'virtual_pixel', 'eye_switch', 'mode3d', 'dual_3d', 'stereo_fmt',
  'vsync_mul', 'framerate', 'osd',
  'low_gray', 'canvas_mode', 'canvas_switch_mode', 'out_fps', 'vsync_src'
]
const initialDevice = ['sn', 'uh5_st', 'low_pwr', 'allports', 'portout']
const reserved = [
  'layer', 'layer_border', 'brt_port', 'pic_adj', 'sndinfo', 'snd_eth', 'pr_layer', 'pr_group', 'pr_video',
  'pr_vsync', 'port_area', 'pr_video_count', 'mfc_probe', 'rcv_probe', 'mod_probe', 'pr_rcv_state'
]

test('catalog order and phases', () => {
  const cmds = POLL_CATALOG.map((entry) => entry.cmd)
  assert.deepEqual(cmds, [...initialScreen, ...initialDevice, ...reserved])
  assert.deepEqual(
    POLL_CATALOG.filter((entry) => entry.phase === 'initial' && entry.scope === 'screen-group').map((entry) => entry.cmd),
    initialScreen
  )
  assert.deepEqual(
    POLL_CATALOG.filter((entry) => entry.phase === 'initial' && entry.scope === 'device').map((entry) => entry.cmd),
    initialDevice
  )
  assert.deepEqual(
    POLL_CATALOG.filter((entry) => entry.phase === 'reserved').map((entry) => entry.cmd),
    reserved
  )
})

test('U9 selection skips reserved and unsupported gets', () => {
  const requests = selectPollRequests({ protocol: 'B-Protocol', modelByte: 35 }, [1])
  assert.deepEqual(
    requests.map((request) => request.cmd),
    [
      'bright', 'colortemp', 'freeze', 'blackout', 'testmode', 'hdrmode', 'mute', 'fade', 'fadetime', 'zerodelay',
      'bg_box', 'c_depth', 'colorspace', 'prec_mgr', 'ct_r', 'ct_g', 'ct_b', 'virtual_pixel', 'eye_switch',
      'mode3d', 'dual_3d', 'stereo_fmt', 'vsync_mul', 'osd', 'sn', 'allports', 'portout'
    ]
  )
  assert.equal(requests.some((request) => request.cmd === 'layer'), false)
  assert.deepEqual(requests.find((request) => request.cmd === 'bright'), {
    cmd: 'bright',
    sid: 1,
    gid: 1,
    data: { gid: 1 }
  })
  assert.deepEqual(requests.find((request) => request.cmd === 'sn'), { cmd: 'sn', sid: 1 })
  assert.deepEqual(requests.find((request) => request.cmd === 'portout'), {
    cmd: 'portout',
    sid: 1,
    data: { port: 1 }
  })
})

test('multiple screen groups expand inside catalog order', () => {
  const bright = selectPollRequests({ protocol: 'B-Protocol', modelByte: 35 }, [1, 2]).filter(
    (request) => request.cmd === 'bright' || request.cmd === 'colortemp'
  )
  assert.deepEqual(
    bright.map((request) => `${request.cmd}:${request.gid}`),
    ['bright:1', 'bright:2', 'colortemp:1', 'colortemp:2']
  )
})

test('port and brightness projection', () => {
  assert.deepEqual(
    projectPollData('portout', { ports: [{ idx: 0, en: 0 }, { idx: 1, en: 1 }] }),
    { port_output: { '1': 0, '2': 1 } }
  )
  assert.deepEqual(projectPollData('portout', { count: 1 }), {})
  assert.deepEqual(projectPollData('portout', { ports: [] }), { port_output: {} })
  assert.deepEqual(projectPollData('bright', { brt: 5000 }), { brightness: 50 })
})

test('V20 polls canvas sync commands for gid 1', () => {
  const requests = selectPollRequests({ protocol: 'B-Protocol', modelByte: 50 }, [1])
  for (const cmd of ['low_gray', 'canvas_mode', 'canvas_switch_mode', 'out_fps', 'vsync_src']) {
    assert.deepEqual(requests.find((request) => request.cmd === cmd), {
      cmd,
      sid: 1,
      gid: 1,
      data: { gid: 1 }
    })
  }
  const cmds = requests.map((request) => request.cmd)
  const start = cmds.indexOf('low_gray')
  assert.deepEqual(cmds.slice(start, start + 5), [
    'low_gray',
    'canvas_mode',
    'canvas_switch_mode',
    'out_fps',
    'vsync_src'
  ])
})

test('canvas sync projection follows valid and numeric rules', () => {
  assert.deepEqual(projectPollData('low_gray', { en: 1, gid: 1 }), { low_gray_enable: 1 })
  assert.deepEqual(projectPollData('low_gray', { en: 2, gid: 1 }), {})
  assert.deepEqual(projectPollData('canvas_mode', { mode: 1, gid: 1, valid: 1 }), { canvas_mode: 1 })
  assert.deepEqual(projectPollData('canvas_mode', { mode: 1, gid: 1, valid: 0 }), { canvas_mode: '' })
  assert.deepEqual(projectPollData('canvas_switch_mode', { switchMode: 0, gid: 1, valid: 1 }), {
    canvas_switch_mode: 0
  })
  assert.deepEqual(projectPollData('canvas_switch_mode', { switchMode: 1, gid: 1, valid: 0 }), {
    canvas_switch_mode: ''
  })
  assert.deepEqual(projectPollData('out_fps', { gid: 1, fps10000: 599400, fps100: 5994, valid: 1 }), {
    output_frame_rate: 59.94
  })
  assert.deepEqual(projectPollData('out_fps', { gid: 1, fps10000: 599400, valid: 0 }), {
    output_frame_rate: ''
  })
  assert.deepEqual(projectPollData('vsync_src', { gid: 1, src: 1, curSrc: 1 }), {
    vsync_source: 1,
    vsync_current_source: 1
  })
  assert.deepEqual(projectPollData('vsync_src', { gid: 1, src: 2 }), {
    vsync_source: 2,
    vsync_current_source: ''
  })
})
