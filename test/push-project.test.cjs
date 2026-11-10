const { test } = require('node:test')
const assert = require('node:assert/strict')
const { valuesFromPush } = require('../dist/variables/push')
const { buildScreenGroupPlan } = require('../dist/variables/screen-groups')

const u9 = { protocol: 'B-Protocol', modelByte: 35 }
const v10 = { protocol: 'B-Protocol', modelByte: 50 }
const u9One = buildScreenGroupPlan(u9, [1])
const u9Two = buildScreenGroupPlan(u9, [1, 2])
const vBoth = buildScreenGroupPlan(v10, [1, 2])

test('bright with gid 1 becomes sg_1_brightness 80', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000, gid: 1 } }, u9, u9One),
    { sg_1_brightness: 80 }
  )
})

test('a screen-group push without gid uses group 1', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000 } }, u9, u9One),
    { sg_1_brightness: 80 }
  )
})

test('a missing push code is treated as success', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', data: { brt: 8000, gid: 1 } }, u9, u9One),
    { sg_1_brightness: 80 }
  )
})

test('an unpublished screen group writes nothing', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000, gid: 2 } }, u9, u9One),
    {}
  )
})

test('a device command ignores gid', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'sn', code: 0, data: { serial: 'ABC', gid: 2 } }, u9, u9One),
    { serial_number: 'ABC' }
  )
})

test('vsync_src on V writes src only for the published screen group', () => {
  assert.deepEqual(
    valuesFromPush(
      {
        cmd: 'vsync_src',
        code: 0,
        data: { gid: 1, src: 0, boardSlot: 16, boardKind: 24, boardIdx: 0, srcType: 32, srcIdx: 1, fpx100: 5994, phaseUs: 100 }
      },
      v10,
      vBoth
    ),
    { sg_1_vsync_src: 0 }
  )
  assert.deepEqual(valuesFromPush({ cmd: 'vsync_src', code: 0, data: { gid: 1 } }, v10, vBoth), {})
  assert.deepEqual(
    valuesFromPush({ cmd: 'vsync_src', code: 0, data: { gid: 2, src: 1 } }, v10, vBoth),
    { sg_1_vsync_src: 1 }
  )
})

test('reserved, unknown, unsupported, and failed pushes write nothing', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'layer', code: 0, data: { layer: 1, x: 0, y: 0, w: 1, h: 1, gid: 1 } }, u9, u9One),
    {}
  )
  assert.deepEqual(valuesFromPush({ cmd: 'not_a_cmd', code: 0, data: {} }, u9, u9One), {})
  assert.deepEqual(
    valuesFromPush({ cmd: 'low_gray', code: 0, data: { en: 1, gid: 1 } }, u9, u9One),
    {}
  )
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 9008, data: { brt: 8000, gid: 1 } }, u9, u9One),
    {}
  )
})

test('V brightness and freeze land on screen group 1 for any gid', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000, gid: 2 } }, v10, vBoth),
    { sg_1_brightness: 80 }
  )
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000, gid: 1 } }, v10, vBoth),
    { sg_1_brightness: 80 }
  )
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000 } }, v10, vBoth),
    { sg_1_brightness: 80 }
  )
  assert.deepEqual(
    valuesFromPush({ cmd: 'freeze', code: 0, data: { en: 1, gid: 1 } }, v10, vBoth),
    { sg_1_freeze_enable: 1 }
  )
  assert.deepEqual(
    valuesFromPush({ cmd: 'freeze', code: 0, data: { en: 1, gid: 2 } }, v10, vBoth),
    { sg_1_freeze_enable: 1 }
  )
  assert.deepEqual(
    valuesFromPush({ cmd: 'low_gray', code: 0, data: { en: 1, gid: 2 } }, v10, vBoth),
    { sg_1_low_gray_enable: 1 }
  )
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000, gid: 2 } }, v10, []),
    {}
  )
})

test('a published second U9 group accepts brightness', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'bright', code: 0, data: { brt: 8000, gid: 2 } }, u9, u9Two),
    { sg_2_brightness: 80 }
  )
})

test('pr_group is not projected by valuesFromPush', () => {
  assert.deepEqual(
    valuesFromPush({ cmd: 'pr_group', code: 0, data: { groupIds: [1], groupCount: 1 } }, u9, u9One),
    {}
  )
})
