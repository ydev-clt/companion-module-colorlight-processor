const { test } = require('node:test')
const assert = require('node:assert/strict')
const { listPublishedVariables } = require('../dist/variables/index')

test('U9 publishes sg_1 names and skips reserved and unsupported commands', () => {
  const defs = listPublishedVariables({ protocol: 'B-Protocol', modelByte: 35 }, [1])
  assert.equal(defs.sg_1_brightness.name.length > 0, true)
  assert.equal(defs.sg_1_freeze_enable !== undefined, true)
  assert.equal(defs.port_output !== undefined, true)
  assert.equal(defs.brightness, undefined)
  assert.equal(defs.freeze_enable, undefined)
  assert.equal(defs.sg_1_hue, undefined)
  assert.equal(defs.layer, undefined)
  assert.equal(defs.sg_1_layer, undefined)
})

test('two screen groups publish two brightness variables', () => {
  const defs = listPublishedVariables({ protocol: 'B-Protocol', modelByte: 35 }, [1, 2])
  assert.equal(defs.sg_1_brightness !== undefined, true)
  assert.equal(defs.sg_2_brightness !== undefined, true)
  assert.equal(Object.keys(defs).filter((id) => id === 'port_output').length, 1)
})

test('V20 publishes canvas sync variables and U9 does not', () => {
  const v20 = listPublishedVariables({ protocol: 'B-Protocol', modelByte: 50 }, [1])
  assert.equal(v20.sg_1_low_gray_enable.name.includes('low_gray_enable (0: off, 1: on)'), true)
  assert.equal(v20.sg_1_canvas_mode.name.includes('canvas_mode (0: normal, 1: switcher)'), true)
  assert.equal(
    v20.sg_1_canvas_switch_mode.name.includes('canvas_switch_mode (0: copy, 1: swap)'),
    true
  )
  assert.equal(v20.sg_1_output_frame_rate.name.includes('output_frame_rate (Hz)'), true)
  assert.equal(v20.sg_1_vsync_source.name.includes('selected'), true)
  assert.equal(v20.sg_1_vsync_current_source.name.includes('current'), true)
  assert.equal(v20.sg_1_vsync_source.name.includes('0: input, 1: Genlock, 2: internal, 3: auto lock, 4: ODCK'), true)

  const u9 = listPublishedVariables({ protocol: 'B-Protocol', modelByte: 35 }, [1])
  assert.equal(u9.sg_1_low_gray_enable, undefined)
  assert.equal(u9.sg_1_output_frame_rate, undefined)
  assert.equal(u9.sg_1_vsync_source, undefined)
})
