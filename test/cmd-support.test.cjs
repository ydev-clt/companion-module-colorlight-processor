const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isCmdOpSupported } = require('../dist/common/cmd-support')

const u9 = { protocol: 'B-Protocol', modelByte: 35 }
const v20 = { protocol: 'B-Protocol', modelByte: 50 }
const unresolved = { protocol: 'B-Protocol', modelByte: null }

test('bright is readable and writable on U9', () => {
  assert.equal(isCmdOpSupported('bright', 'get', u9), true)
  assert.equal(isCmdOpSupported('bright', 'set', u9), true)
})

test('reboot is set-only on U9', () => {
  assert.equal(isCmdOpSupported('reboot', 'set', u9), true)
  assert.equal(isCmdOpSupported('reboot', 'get', u9), false)
})

test('hdrmode get and set are both rejected on V20', () => {
  assert.equal(isCmdOpSupported('hdrmode', 'get', v20), false)
  assert.equal(isCmdOpSupported('hdrmode', 'set', v20), false)
})

test('an empty get rule and a missing set rule are unsupported', () => {
  assert.equal(isCmdOpSupported('sndinfo', 'get', u9), false)
  assert.equal(isCmdOpSupported('sndinfo', 'set', u9), false)
})

test('an unresolved model supports neither side', () => {
  assert.equal(isCmdOpSupported('bright', 'get', unresolved), false)
  assert.equal(isCmdOpSupported('bright', 'set', unresolved), false)
})

test('an unknown command is unsupported', () => {
  assert.equal(isCmdOpSupported('not-a-cmd', 'get', u9), false)
})
