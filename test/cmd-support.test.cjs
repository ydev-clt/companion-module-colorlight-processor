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

const vx20 = { protocol: 'B-Protocol', modelByte: 34 }

test('V20 and VX20 support the canvas sync commands', () => {
  for (const device of [v20, vx20]) {
    assert.equal(isCmdOpSupported('low_gray', 'get', device), true)
    assert.equal(isCmdOpSupported('low_gray', 'set', device), true)
    assert.equal(isCmdOpSupported('canvas_switch_mode', 'get', device), true)
    assert.equal(isCmdOpSupported('canvas_switch_mode', 'set', device), true)
    assert.equal(isCmdOpSupported('vsync_src', 'get', device), true)
    assert.equal(isCmdOpSupported('vsync_src', 'set', device), true)
    assert.equal(isCmdOpSupported('take', 'get', device), false)
    assert.equal(isCmdOpSupported('take', 'set', device), true)
    assert.equal(isCmdOpSupported('cut', 'get', device), false)
    assert.equal(isCmdOpSupported('cut', 'set', device), true)
    assert.equal(isCmdOpSupported('canvas_mode', 'get', device), true)
    assert.equal(isCmdOpSupported('canvas_mode', 'set', device), false)
    assert.equal(isCmdOpSupported('out_fps', 'get', device), true)
    assert.equal(isCmdOpSupported('out_fps', 'set', device), false)
  }
})

test('U9 supports low_gray but not the V/VX-only canvas sync commands', () => {
  assert.equal(isCmdOpSupported('low_gray', 'get', u9), true)
  assert.equal(isCmdOpSupported('low_gray', 'set', u9), true)
  for (const cmd of ['take', 'cut', 'canvas_switch_mode', 'canvas_mode', 'out_fps']) {
    assert.equal(isCmdOpSupported(cmd, 'get', u9), false)
    assert.equal(isCmdOpSupported(cmd, 'set', u9), false)
  }
  for (const cmd of ['low_gray', 'take', 'cut', 'canvas_switch_mode', 'canvas_mode', 'out_fps']) {
    assert.equal(isCmdOpSupported(cmd, 'get', unresolved), false)
    assert.equal(isCmdOpSupported(cmd, 'set', unresolved), false)
  }
})

test('vsync_src get and set are supported on every resolved B model', () => {
  assert.equal(isCmdOpSupported('vsync_src', 'get', u9), true)
  assert.equal(isCmdOpSupported('vsync_src', 'set', u9), true)
  assert.equal(isCmdOpSupported('vsync_src', 'get', unresolved), false)
  assert.equal(isCmdOpSupported('vsync_src', 'set', unresolved), false)
  assert.equal(isCmdOpSupported('vsync_src', 'set', { protocol: 'A-Protocol', modelByte: 35 }), false)
})

test('qp set is available on V, VX, and U, but save and rename stay off V', () => {
  const v10 = { protocol: 'B-Protocol', modelByte: 50 }
  const vx20Device = { protocol: 'B-Protocol', modelByte: 34 }
  const u9Max = { protocol: 'B-Protocol', modelByte: 35 }
  const unknown = { protocol: 'B-Protocol', modelByte: null }
  for (const device of [v10, vx20Device]) {
    assert.equal(isCmdOpSupported('qp', 'set', device), true)
    assert.equal(isCmdOpSupported('qp', 'get', device), false)
  }
  assert.equal(isCmdOpSupported('qp', 'set', u9Max), true)
  assert.equal(isCmdOpSupported('qp', 'set', unknown), false)
  assert.equal(isCmdOpSupported('svpreset', 'set', v10), false)
  assert.equal(isCmdOpSupported('rpname', 'set', v10), false)
})

test('videosrc set is supported on resolved A/B models and has no get', () => {
  const v20Model = { protocol: 'B-Protocol', modelByte: 51 }
  for (const device of [u9, v20Model]) {
    assert.equal(isCmdOpSupported('videosrc', 'set', device), true)
    assert.equal(isCmdOpSupported('videosrc', 'get', device), false)
  }
  assert.equal(isCmdOpSupported('videosrc', 'set', unresolved), false)
  assert.equal(isCmdOpSupported('videosrc', 'get', unresolved), false)
  assert.equal(isCmdOpSupported('videosrc', 'set', { protocol: 'A-Protocol', modelByte: 35 }), false)
})
