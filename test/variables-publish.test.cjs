const { test } = require('node:test')
const assert = require('node:assert/strict')
const { listPublishedVariables } = require('../dist/variables/index')
const { buildScreenGroupPlan } = require('../dist/variables/screen-groups')

const u9 = { protocol: 'B-Protocol', modelByte: 35 }
const v10 = { protocol: 'B-Protocol', modelByte: 50 }

test('U9 publishes sg_1 names and skips reserved and unsupported commands', () => {
  const defs = listPublishedVariables(u9, buildScreenGroupPlan(u9, [1]), true)
  assert.equal(defs.sg_1_brightness.name.length > 0, true)
  assert.equal(defs.sg_1_freeze_enable !== undefined, true)
  assert.equal(defs.port_output !== undefined, true)
  assert.equal(defs.screen_group_count.name.length > 0, true)
  assert.equal(defs.brightness, undefined)
  assert.equal(defs.freeze_enable, undefined)
  assert.equal(defs.sg_1_hue, undefined)
  assert.equal(defs.layer, undefined)
  assert.equal(defs.sg_1_layer, undefined)
})

test('two screen groups publish two brightness variables', () => {
  const defs = listPublishedVariables(u9, buildScreenGroupPlan(u9, [1, 2]), true)
  assert.equal(defs.sg_1_brightness !== undefined, true)
  assert.equal(defs.sg_2_brightness !== undefined, true)
  assert.equal(Object.keys(defs).filter((id) => id === 'port_output').length, 1)
})

test('dropping a gid removes that gid and keeps the list variable', () => {
  const defs = listPublishedVariables(u9, buildScreenGroupPlan(u9, [1]), true)
  assert.equal(defs.sg_1_brightness !== undefined, true)
  assert.equal(defs.sg_2_brightness, undefined)
  assert.equal(defs.screen_group_count !== undefined, true)
})

test('V10 publishes gid 1 freeze and gid 2 canvas variables', () => {
  const defs = listPublishedVariables(v10, buildScreenGroupPlan(v10, [1, 2]), true)
  assert.equal(defs.sg_1_freeze_enable !== undefined, true)
  assert.equal(defs.sg_2_brightness !== undefined, true)
  assert.equal(defs.sg_2_canvas_mode.name.includes('canvas_mode (0: normal, 1: switcher)'), true)
  assert.equal(defs.sg_2_canvas_switch_mode.name.includes('canvas_switch_mode (0: copy, 1: swap)'), true)
  assert.equal(defs.sg_2_output_frame_rate.name.includes('output_frame_rate (Hz)'), true)
  assert.equal(defs.sg_2_low_gray_enable.name.includes('low_gray_enable (0: off, 1: on)'), true)
  assert.equal(defs.sg_2_vsync_source.name.includes('selected'), true)
  assert.equal(defs.sg_2_vsync_current_source.name.includes('current'), true)
  assert.equal(defs.sg_2_vsync_source.name.includes('0: input, 1: Genlock, 2: internal, 3: auto lock, 4: ODCK'), true)
  assert.equal(defs.screen_group_count !== undefined, true)
  assert.equal(defs.sg_1_brightness, undefined)
  assert.equal(defs.sg_1_canvas_mode, undefined)
  assert.equal(defs.sg_1_low_gray_enable, undefined)
  assert.equal(defs.sg_2_freeze_enable, undefined)
  assert.equal(defs.sg_1_layer, undefined)
})

test('an unknown list publishes device variables only', () => {
  const defs = listPublishedVariables(u9, [], false)
  assert.equal(defs.port_output !== undefined, true)
  assert.equal(defs.screen_group_count, undefined)
  assert.equal(Object.keys(defs).some((id) => id.startsWith('sg_')), false)
})
