const { test } = require('node:test')
const assert = require('node:assert/strict')
const { deliverParsedResponse, dispatchInboundItems } = require('../dist/actions/string-protocol/core/transmitter')

test('a pending id resolves and does not become unsolicited', () => {
  const handlers = new Map()
  let resolved
  let unsolicited = 0
  handlers.set(7, { resolve: (resp) => { resolved = resp } })
  deliverParsedResponse({ id: 7, cmd: 'bright' }, handlers, () => { unsolicited += 1 })
  assert.equal(resolved.cmd, 'bright')
  assert.equal(unsolicited, 0)
  assert.equal(handlers.has(7), false)
})

test('an unmatched id is unsolicited', () => {
  const seen = []
  deliverParsedResponse({ id: 4, cmd: 'freeze' }, new Map(), (resp) => seen.push(resp.cmd))
  assert.deepEqual(seen, ['freeze'])
})

test('push and get in one array take separate callbacks', () => {
  const pushed = []
  const responses = []
  dispatchInboundItems(
    [
      { id: 0, cmd: 'bright', op: 'push', code: 0, data: { brt: 1, gid: 1 } },
      { id: 7, cmd: 'freeze', op: 'get', code: 0 },
      { id: 8, op: 'push' },
      { cmd: 'bright' },
      null
    ],
    {
      onPush: (item) => pushed.push(item),
      onResponse: (item) => responses.push(item)
    }
  )
  assert.deepEqual(pushed, [{ id: 0, cmd: 'bright', op: 'push', code: 0, data: { brt: 1, gid: 1 } }])
  assert.deepEqual(responses, [{ id: 7, cmd: 'freeze', op: 'get', code: 0 }])
})

test('dispatchInboundItems does not accept a handler map', () => {
  assert.equal(dispatchInboundItems.length, 2)
})
