const { test } = require('node:test')
const assert = require('node:assert/strict')
const { deliverParsedResponse } = require('../dist/actions/string-protocol/core/transmitter')

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
