const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setupDeviceActions } = require('../dist/actions/string-protocol/actions/device')
const { setupLogger } = require('../dist/common/log')

function host() {
  const sent = []
  const actions = setupDeviceActions({
    ctx: { config: {}, state: { protocol: 'B-Protocol', modelByte: 50 } },
    conn: {
      sendOnly: async (cmd, op, sid, data) => {
        sent.push({ cmd, op, sid, data })
        return true
      },
      sendAndAwait: async () => undefined
    },
    setVariableValues: () => {}
  })
  return { actions, sent }
}

function captureWarnings() {
  const warnings = []
  setupLogger((level, message) => {
    if (level === 'warn') warnings.push(message)
  })
  return warnings
}

test('a 32-character serial number is sent', async () => {
  const { actions, sent } = host()
  const warnings = captureWarnings()
  const serial = 'a'.repeat(32)

  await actions.string_serial_number_set.callback({ options: { deviceId: 3, serial } })

  assert.deepEqual(sent, [{ cmd: 'sn', op: 'set', sid: 3, data: { serial } }])
  assert.deepEqual(warnings, [])
})

test('a serial number longer than 32 characters is truncated', async () => {
  const { actions, sent } = host()
  const warnings = captureWarnings()

  await actions.string_serial_number_set.callback({ options: { deviceId: 3, serial: 'a'.repeat(40) } })

  assert.deepEqual(sent, [{ cmd: 'sn', op: 'set', sid: 3, data: { serial: 'a'.repeat(32) } }])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /32/)
})
