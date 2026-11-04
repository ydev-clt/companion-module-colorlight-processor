const { test } = require('node:test')
const assert = require('node:assert/strict')
const { valuesFromPush } = require('../dist/variables/push')

const u9 = { protocol: 'B-Protocol', modelByte: 35 }
const v20 = { protocol: 'B-Protocol', modelByte: 50 }
const groups = [1]

test('bright with gid 1 becomes sg_1_brightness 80', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000, gid: 1 } }, u9, groups),
    { sg_1_brightness: 80 }
  )
})

test('a screen-group push without gid uses group 1', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000 } }, u9, groups),
    { sg_1_brightness: 80 }
  )
})

test('a missing push code is treated as success', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', data: { brt: 8000, gid: 1 } }, u9, groups),
    { sg_1_brightness: 80 }
  )
})

test('an unpublished screen group writes nothing', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000, gid: 2 } }, u9, groups),
    {}
  )
})

test('a device command ignores gid', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'sn', code: 0, data: { serial: 'ABC', gid: 2 } }, u9, groups),
    { serial_number: 'ABC' }
  )
})

test('vsync_src reuses the poll projection for missing sources', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'vsync_src', code: 0, data: { gid: 1 } }, v20, groups),
    { sg_1_vsync_source: '', sg_1_vsync_current_source: '' }
  )
})

test('reserved, unknown, unsupported, and failed pushes write nothing', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'layer', code: 0, data: { layer: 1, x: 0, y: 0, w: 1, h: 1, gid: 1 } }, u9, groups),
    {}
  )
  assert.deepEqual(valuesFromPush({ cmd: 'not_a_cmd', code: 0, data: {} }, u9, groups), {})
  assert.deepEqual(
    valuesFromPush({ cmd: 'low_gray', code: 0, data: { en: 1, gid: 1 } }, u9, groups),
    {}
  )
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 9008, data: { brt: 8000, gid: 1 } }, u9, groups),
    {}
  )
})
