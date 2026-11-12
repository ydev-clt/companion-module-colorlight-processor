const { test } = require('node:test')
const assert = require('node:assert/strict')
const { routePush } = require('../dist/push-router')
const { buildScreenGroupPlan } = require('../dist/variables/screen-groups')

const u9 = { protocol: 'B-Protocol', modelByte: 35 }
const v10 = { protocol: 'B-Protocol', modelByte: 50 }
const u9One = buildScreenGroupPlan(u9, [1])
const vBoth = buildScreenGroupPlan(v10, [1, 2])

test('pr_group replaces the managed list', () => {
  const route = routePush({
    cmd: 'pr_group',
    code: 0,
    data: { groupIds: [2, 2, 1] },
    identity: u9,
    managedGroupIds: null,
    slots: []
  })
  assert.deepEqual(route.nextGroupIds, [2, 1])
  assert.equal(route.values, undefined)
})

test('an empty or invalid pr_group does not replace the list', () => {
  for (const data of [{ groupIds: [] }, { groupIds: [0, 1] }, {}]) {
    const route = routePush({
      cmd: 'pr_group',
      code: 0,
      data,
      identity: u9,
      managedGroupIds: [1],
      slots: u9One
    })
    assert.deepEqual(route, {})
  }
})

test('a screen push adds the missing gid and writes against the new plan', () => {
  const route = routePush({
    cmd: 'bright',
    code: 0,
    data: { brt: 8000, gid: 2 },
    identity: u9,
    managedGroupIds: [1],
    slots: u9One
  })
  assert.deepEqual(route.nextGroupIds, [1, 2])
  assert.deepEqual(route.values, { sg_2_brightness: 80 })
})

test('a V/VX push does not add a gid but writes the planned group 1 leaf', () => {
  const route = routePush({
    cmd: 'bright',
    code: 0,
    data: { brt: 8000, gid: 2 },
    identity: v10,
    managedGroupIds: [1, 2],
    slots: vBoth
  })
  assert.equal(route.nextGroupIds, undefined)
  assert.deepEqual(route.values, { sg_1_brightness: 80 })
})

test('a push without projected leaves returns no values', () => {
  const route = routePush({
    cmd: 'not_a_cmd',
    code: 0,
    data: {},
    identity: u9,
    managedGroupIds: [1],
    slots: u9One
  })
  assert.deepEqual(route, {})
})
