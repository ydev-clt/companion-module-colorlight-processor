const fs = require('node:fs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { CMD, OP } = require('../dist/actions/string-protocol/core/constants')
const { deliverParsedResponse, dispatchInboundItems, SPTransmitter } = require('../dist/actions/string-protocol/core/transmitter')

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

test('comm_obj and push are named protocol values', () => {
  assert.equal(CMD.COMM_OBJ, 'comm_obj')
  assert.equal(OP.PUSH, 'push')
})

test('subscribePush before init returns false and encodes the documented payload', async () => {
  const transmitter = new SPTransmitter()
  assert.equal(await transmitter.subscribePush(), false)
  const src = fs.readFileSync('dist/actions/string-protocol/core/transmitter.js', 'utf8')
  assert.match(
    src,
    /subscribePush\(\) \{\s*return this\.sendOnly\(constants_1\.CMD\.COMM_OBJ,\s*'set',\s*1,\s*\{\s*obj:\s*0,\s*pushEn:\s*1,\s*alsoSelf:\s*1\s*\}\);/
  )
  assert.match(src, /releaseSpSession\(\) \{\s*this\._onPush = \(\) => \{ \};/)
})
