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
