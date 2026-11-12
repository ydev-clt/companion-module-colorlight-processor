const { test } = require('node:test')
const assert = require('node:assert/strict')
const { bindSession } = require('../dist/session-bind')

function harness(overrides = {}) {
  const calls = []
  let push
  const transmitter = {
    bindSpSession: async (proto, options) => {
      calls.push(['bind', proto, options])
      if (overrides.bindError) throw new Error('bind failed')
    },
    setOnPush: (callback) => {
      calls.push(['setOnPush'])
      push = callback
    },
    subscribePush: async () => {
      calls.push(['subscribe'])
      return overrides.subscribed ?? true
    },
    startHeartbeat: (onFailure, runSerialized) => {
      calls.push(['heartbeat'])
      assert.equal(typeof onFailure, 'function')
      assert.equal(typeof runSerialized, 'function')
    }
  }
  const connection = {
    beginReceiving: () => calls.push(['beginReceiving'])
  }
  const deps = {
    transmitter,
    connection,
    identity: () => ({ protocol: 'B-Protocol', modelByte: 35 }),
    isCurrent: overrides.isCurrent ?? (() => true),
    onPush: (item) => calls.push(['push', item.cmd]),
    onHeartbeatLost: () => calls.push(['heartbeatLost']),
    onBindFailed: () => calls.push(['bindFailed']),
    startInitialPoll: () => calls.push(['poll']),
    discoverInputSources: () => calls.push(['sources']),
    runSerialized: (fn) => fn()
  }
  return { calls, deps, push: () => push }
}

test('binds, subscribes, then starts heartbeat, poll and source discovery', async () => {
  const run = harness()
  await bindSession(7, run.deps)
  assert.deepEqual(
    run.calls.map((call) => call[0]),
    ['bind', 'setOnPush', 'beginReceiving', 'subscribe', 'heartbeat', 'poll', 'sources']
  )
  assert.deepEqual(run.calls[0][1], 2)
  assert.deepEqual(run.calls[0][2], { downlinkChecksum: true })
})

test('a failed subscribe still starts heartbeat and poll', async () => {
  const run = harness({ subscribed: false })
  await bindSession(7, run.deps)
  assert.deepEqual(
    run.calls.map((call) => call[0]),
    ['bind', 'setOnPush', 'beginReceiving', 'subscribe', 'heartbeat', 'poll', 'sources']
  )
})

test('a stale generation stops after bind and does not install the push handler', async () => {
  const run = harness({ isCurrent: () => false })
  await bindSession(7, run.deps)
  assert.deepEqual(
    run.calls.map((call) => call[0]),
    ['bind']
  )
})

test('a bind failure calls onBindFailed without starting the receive path', async () => {
  const run = harness({ bindError: true })
  await bindSession(7, run.deps)
  assert.deepEqual(
    run.calls.map((call) => call[0]),
    ['bind', 'bindFailed']
  )
})

test('the installed push handler is dropped when the generation changes', async () => {
  let current = true
  const run = harness({ isCurrent: () => current })
  await bindSession(7, run.deps)
  const push = run.push()
  push({ cmd: 'bright', data: {} })
  current = false
  push({ cmd: 'freeze', data: {} })
  assert.deepEqual(
    run.calls.filter((call) => call[0] === 'push'),
    [['push', 'bright']]
  )
})
