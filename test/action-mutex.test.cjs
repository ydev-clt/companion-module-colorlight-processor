const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ActionMutex } = require('../dist/actions/string-protocol/core/action-mutex')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('a rejected callback releases the lock for the next callback', async () => {
  const mutex = new ActionMutex()
  const events = []

  const first = mutex
    .run(async () => {
      events.push('a-start')
      await delay(20)
      events.push('a-end')
      throw new Error('expected')
    })
    .catch(() => 'failed')
  const second = mutex.run(async () => {
    events.push('b')
    return 'ok'
  })

  assert.deepEqual(await Promise.all([first, second]), ['failed', 'ok'])
  assert.deepEqual(events, ['a-start', 'a-end', 'b'])
})

test('the same mutex instance serializes separate registration passes', async () => {
  const mutex = new ActionMutex()
  const events = []

  const run = (name) =>
    mutex.run(async () => {
      events.push(`${name}-start`)
      await delay(10)
      events.push(`${name}-end`)
    })

  await Promise.all([run('first'), run('second')])
  assert.deepEqual(events, ['first-start', 'first-end', 'second-start', 'second-end'])
})
