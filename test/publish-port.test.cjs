const { test } = require('node:test')
const assert = require('node:assert/strict')
const { getScreenGroupIds } = require('../dist/variables/screen-groups')
const { publishVariableId } = require('../dist/variables/publish')
const { projectPortOutput } = require('../dist/actions/string-protocol/core/port-output')

test('the screen-group list is gid 1', () => {
  assert.deepEqual(getScreenGroupIds(), [1])
})

test('screen-group and device ids', () => {
  assert.equal(publishVariableId('screen-group', 'brightness', 1), 'sg_1_brightness')
  assert.equal(publishVariableId('screen-group', 'freeze_enable', 2), 'sg_2_freeze_enable')
  assert.equal(publishVariableId('device', 'port_output'), 'port_output')
})

test('port output maps idx+1 to en', () => {
  assert.deepEqual(
    projectPortOutput({
      count: 2,
      opticalCount: 0,
      ports: [
        { idx: 0, en: 0 },
        { idx: 1, en: 1 }
      ]
    }),
    { '1': 0, '2': 1 }
  )
})

test('a later duplicate port key wins', () => {
  assert.deepEqual(
    projectPortOutput({ ports: [{ idx: 0, en: 0 }, { idx: 0, en: 1 }] }),
    { '1': 1 }
  )
})

test('invalid port rows are dropped and an empty legal list is an empty object', () => {
  assert.deepEqual(projectPortOutput({ ports: [{ idx: '0', en: 1 }, { en: 1 }] }), {})
})

test('a missing ports array writes nothing', () => {
  assert.equal(projectPortOutput({ count: 1 }), undefined)
  assert.equal(projectPortOutput(null), undefined)
})
