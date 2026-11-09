const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  groupIdsFromPrGroup,
  managedGroupIds,
  screenGroupCountValue,
  pushedGroupToAdd,
  buildScreenGroupPlan
} = require('../dist/variables/screen-groups')

const u9 = { protocol: 'B-Protocol', modelByte: 35 }
const v10 = { protocol: 'B-Protocol', modelByte: 50 }
const vx20 = { protocol: 'B-Protocol', modelByte: 34 }

test('groupIdsFromPrGroup keeps the first copy of each integer gid', () => {
  assert.deepEqual(groupIdsFromPrGroup({ code: 0, data: { groupIds: [2, 2, 1] } }), [2, 1])
  assert.deepEqual(groupIdsFromPrGroup({ data: { groupIds: [1] } }), [1])
  assert.deepEqual(groupIdsFromPrGroup({ code: 1, data: { groupIds: [1] } }), [])
  assert.deepEqual(groupIdsFromPrGroup(undefined), [])
  assert.deepEqual(groupIdsFromPrGroup({ code: 0, data: { groupIds: [] } }), [])
  assert.deepEqual(groupIdsFromPrGroup({ code: 0, data: { groupIds: [0, 1] } }), [])
})

test('managedGroupIds filters V and VX down to groups 1 and 2', () => {
  assert.deepEqual(managedGroupIds(u9, [2, 1, 3]), [2, 1, 3])
  assert.deepEqual(managedGroupIds(v10, [2, 2, 1, 3]), [2, 1])
  assert.deepEqual(managedGroupIds(vx20, [2, 2, 1, 3]), [2, 1])
  assert.deepEqual(managedGroupIds(v10, [3]), [])
  assert.deepEqual(screenGroupCountValue([2, 1]), { count: 2, ids: [2, 1] })
  assert.deepEqual(screenGroupCountValue([]), { count: 0, ids: [] })
})

test('pushedGroupToAdd only returns a missing eligible gid', () => {
  assert.equal(pushedGroupToAdd(u9, 'bright', { gid: 2 }, [1]), 2)
  assert.equal(pushedGroupToAdd(u9, 'bright', { gid: 1 }, [1]), undefined)
  assert.equal(pushedGroupToAdd(u9, 'bright', {}, null), 1)
  assert.equal(pushedGroupToAdd(u9, 'layer', { gid: 4 }, [1]), undefined)
  assert.equal(pushedGroupToAdd(v10, 'freeze', { gid: 1 }, [2]), 1)
  assert.equal(pushedGroupToAdd(v10, 'bright', { gid: 1 }, [2]), undefined)
  assert.equal(pushedGroupToAdd(v10, 'freeze', { gid: 2 }, [1]), undefined)
  assert.equal(pushedGroupToAdd(v10, 'bright', { gid: 3 }, [1, 2]), undefined)
  assert.equal(pushedGroupToAdd(u9, 'bright', { gid: 1.5 }, [1]), undefined)
})

test('buildScreenGroupPlan repeats the current U9 screen commands per gid', () => {
  const one = buildScreenGroupPlan(u9, [1]).map((slot) => slot.cmd)
  assert.equal(one.includes('low_gray'), false)
  assert.equal(one.includes('canvas_mode'), false)
  assert.equal(one.includes('out_fps'), false)
  assert.equal(one.includes('vsync_src'), true)
  assert.equal(one.includes('layer'), false)
  assert.deepEqual(
    buildScreenGroupPlan(u9, [1, 2]).map((slot) => `${slot.cmd}:${slot.gid}`),
    [...one.map((cmd) => `${cmd}:1`), ...one.map((cmd) => `${cmd}:2`)]
  )
  assert.deepEqual(
    buildScreenGroupPlan(u9, [2, 1]).map((slot) => `${slot.cmd}:${slot.gid}`),
    [...one.map((cmd) => `${cmd}:2`), ...one.map((cmd) => `${cmd}:1`)]
  )
  assert.equal(buildScreenGroupPlan(u9, [1, 1]).length, one.length)
})

test('buildScreenGroupPlan splits V and VX commands by gid', () => {
  const expected = [
    'freeze:1', 'blackout:1', 'testmode:1', 'vsync_src:1',
    'bright:2', 'colortemp:2', 'c_depth:2', 'ct_r:2', 'ct_g:2', 'ct_b:2',
    'low_gray:2', 'canvas_mode:2', 'canvas_switch_mode:2', 'out_fps:2'
  ]
  assert.deepEqual(buildScreenGroupPlan(v10, [1, 2]).map((slot) => `${slot.cmd}:${slot.gid}`), expected)
  assert.deepEqual(buildScreenGroupPlan(vx20, [1, 2]).map((slot) => `${slot.cmd}:${slot.gid}`), expected)
  assert.deepEqual(buildScreenGroupPlan(v10, [2, 1]).map((slot) => `${slot.cmd}:${slot.gid}`), [
    ...expected.filter((item) => item.endsWith(':2')),
    ...expected.filter((item) => item.endsWith(':1'))
  ])
  assert.deepEqual(buildScreenGroupPlan(v10, [1]).map((slot) => slot.cmd), [
    'freeze',
    'blackout',
    'testmode',
    'vsync_src'
  ])
  assert.deepEqual(buildScreenGroupPlan(v10, [2]).map((slot) => `${slot.cmd}:${slot.gid}`), expected.filter((item) => item.endsWith(':2')))
  assert.deepEqual(buildScreenGroupPlan(v10, [1, 2, 3]).map((slot) => `${slot.cmd}:${slot.gid}`), expected)
  assert.deepEqual(buildScreenGroupPlan(v10, [3]), [])
  assert.deepEqual(buildScreenGroupPlan(v10, []), [])
  for (const cmd of ['bg_box', 'grp_hue', 'grp_contrast', 'grp_brtcomp', 'layer', 'pr_layer', 'pic_adj', 'pr_canvas']) {
    assert.equal(buildScreenGroupPlan(v10, [1, 2]).some((slot) => slot.cmd === cmd), false)
  }
})
