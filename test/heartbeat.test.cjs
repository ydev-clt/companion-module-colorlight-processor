const { test } = require('node:test')
const assert = require('node:assert/strict')
const { HeartbeatRunner } = require('../dist/actions/string-protocol/core/heartbeat')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate, timeoutMs = 2000) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out')
    await delay(5)
  }
}

test('schedules the next beat after a response, including a non-zero code', async () => {
  let calls = 0
  const failures = []
  const runner = new HeartbeatRunner(
    () => {
      calls += 1
      return Promise.resolve({ code: calls === 1 ? 1 : 0 })
    },
    40,
    () => failures.push('fail')
  )
  try {
    runner.start()
    await delay(20)
    assert.equal(calls, 1)
    // Second beat is at 40ms; the third is at least 40ms after that. Waiting until 50ms
    // observes the second beat without sharing an expiry with the third (that tie left
    // the runner's timer active when the assertion threw).
    await delay(30)
    assert.equal(calls, 2)
    assert.deepEqual(failures, [])
    runner.stop()
    await delay(60)
    assert.equal(calls, 2)
  } finally {
    runner.stop()
  }
})

test('a missing response fails the link only after three consecutive failures', async () => {
  let calls = 0
  const failures = []
  const runner = new HeartbeatRunner(
    () => {
      calls += 1
      return Promise.resolve(undefined)
    },
    40,
    () => failures.push('fail')
  )
  try {
    runner.start()
    await waitFor(() => calls >= 1)
    assert.deepEqual(failures, [])
    await waitFor(() => calls >= 2)
    assert.deepEqual(failures, [])
    await waitFor(() => failures.length > 0)
    assert.deepEqual(failures, ['fail'])
    assert.equal(calls, 3)
    await delay(80)
    assert.equal(calls, 3)
  } finally {
    runner.stop()
  }
})

test('a successful beat resets the consecutive failure count', async () => {
  let calls = 0
  const failures = []
  const runner = new HeartbeatRunner(
    () => {
      calls += 1
      return Promise.resolve(calls === 3 ? { code: 0 } : undefined)
    },
    40,
    () => failures.push('fail')
  )
  try {
    runner.start()
    await waitFor(() => calls >= 2)
    assert.deepEqual(failures, [])
    await waitFor(() => calls >= 4)
    assert.deepEqual(failures, [])
    await waitFor(() => failures.length > 0)
    assert.deepEqual(failures, ['fail'])
    assert.equal(calls, 6)
  } finally {
    runner.stop()
  }
})

test('stop during an in-flight send does not fail the link', async () => {
  let resolveSend
  const failures = []
  const runner = new HeartbeatRunner(
    () =>
      new Promise((resolve) => {
        resolveSend = resolve
      }),
    40,
    () => failures.push('fail')
  )
  try {
    runner.start()
    await delay(10)
    runner.stop()
    resolveSend(undefined)
    await delay(30)
    assert.deepEqual(failures, [])
  } finally {
    runner.stop()
  }
})

test('does not send a second beat while the first send is still pending', async () => {
  let calls = 0
  const runner = new HeartbeatRunner(
    () => {
      calls += 1
      return new Promise(() => {})
    },
    20,
    () => {}
  )
  try {
    runner.start()
    await delay(50)
    assert.equal(calls, 1)
  } finally {
    runner.stop()
  }
})
