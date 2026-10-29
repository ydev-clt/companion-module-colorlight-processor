const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { setupStringActions } = require('../dist/actions/string-protocol/index')

function setup(modelByte) {
  return setupStringActions(
    { config: { protocol: 'B-Protocol' }, state: { modelByte } },
    {},
    () => { throw new Error('setVariableValues should not run during setup') }
  )
}

test('get action definitions are gone from source', () => {
  const display = fs.readFileSync('src/actions/string-protocol/actions/display.ts', 'utf8')
  const ids = fs.readFileSync('src/actions/string-protocol/core/ids.ts', 'utf8')
  const shared = fs.readFileSync('src/actions/string-protocol/actions/_shared.ts', 'utf8')
  assert.equal(display.includes('BRIGHT_GET'), false)
  assert.equal(ids.includes('_GET ='), false)
  assert.equal(shared.includes('function buildGetAction'), false)
  assert.equal(fs.existsSync('src/actions/string-protocol/actions/probe.ts'), false)
})

test('U9 exposes set actions and no get actions', () => {
  const actions = setup(35)
  const ids = Object.keys(actions)
  assert.equal(ids.some((id) => id.endsWith('_get')), false)
  assert.equal(ids.includes('string_brightness_set'), true)
  assert.equal(ids.includes('string_reboot'), true)
  assert.equal(ids.includes('string_hue_set'), false)
  assert.equal(ids.includes('string_raw_command'), true)
})

test('an unresolved model keeps only the raw command', () => {
  assert.deepEqual(Object.keys(setup(null)), ['string_raw_command'])
})
