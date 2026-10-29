const { test } = require('node:test')
const assert = require('node:assert/strict')
const { runInitialPoll } = require('../dist/variables/initial/runner')

function harness(overrides) {
  const sent = []
  const written = []
  const logs = []
  let current = true
  const args = {
    identity: { protocol: 'B-Protocol', modelByte: 35 },
    groupIds: [1],
    isCurrent: () => current,
    send: async (request) => {
      sent.push(request.cmd)
      if (request.cmd === 'freeze') throw new Error('boom')
      if (request.cmd === 'blackout') return { code: 1, data: { en: 1 } }
      if (request.cmd === 'bright') return { code: 0, data: { brt: 5000 } }
      if (request.cmd === 'portout') return { code: 0, data: { ports: [{ idx: 0, en: 0 }, { idx: 1, en: 1 }] } }
      return { code: 0, data: {} }
    },
    write: (values) => written.push(values),
    log: (message) => logs.push(message),
    ...overrides
  }
  return { args, sent, written, logs, stop: () => { current = false } }
}

test('a failure is logged and the following command is still sent', async () => {
  const { args, sent, written, logs } = harness()
  await runInitialPoll(args)
  const freezeAt = sent.indexOf('freeze')
  const blackoutAt = sent.indexOf('blackout')
  assert.ok(freezeAt >= 0 && blackoutAt > freezeAt)
  assert.ok(logs.some((line) => line.includes('freeze') && line.includes('gid=1')))
  assert.ok(logs.some((line) => line.includes('blackout') && line.includes('gid=1')))
  assert.deepEqual(written.find((values) => Object.prototype.hasOwnProperty.call(values, 'sg_1_brightness')), {
    sg_1_brightness: 50
  })
  assert.equal(written.some((values) => Object.prototype.hasOwnProperty.call(values, 'sg_1_freeze_enable')), false)
  assert.deepEqual(written.find((values) => Object.prototype.hasOwnProperty.call(values, 'port_output')), {
    port_output: { '1': 0, '2': 1 }
  })
})

test('a generation change stops the run and drops a late success', async () => {
  const { args, sent, written, stop } = harness({
    send: async (request) => {
      sent.push(request.cmd)
      if (request.cmd === 'bright') {
        stop()
        return { code: 0, data: { brt: 5000 } }
      }
      return { code: 0, data: {} }
    }
  })
  await runInitialPoll(args)
  assert.deepEqual(sent, ['bright'])
  assert.deepEqual(written, [])
})
