const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readProbeFrame, PROBE_FRAME_MAX_LENGTH } = require('../dist/tcp-probe-frame')

test('waits until four header bytes exist', () => {
  assert.deepEqual(readProbeFrame(Buffer.from([0xea, 0x00, 0x18])), { status: 'need-header' })
})

test('waits when the declared length is not buffered yet', () => {
  const buf = Buffer.alloc(4)
  buf.writeUInt16LE(24, 2)
  assert.deepEqual(readProbeFrame(buf), { status: 'need-more' })
})

test('returns one frame and ignores bytes past the declared length', () => {
  const buf = Buffer.alloc(26)
  buf[0] = 0xea
  buf.writeUInt16LE(24, 2)
  buf[24] = 0x11
  buf[25] = 0x22
  const read = readProbeFrame(buf)
  assert.equal(read.status, 'frame')
  assert.equal(read.frame.length, 24)
  assert.equal(read.frame[0], 0xea)
})

test('rejects a length below 4', () => {
  const buf = Buffer.alloc(4)
  buf.writeUInt16LE(0, 2)
  assert.deepEqual(readProbeFrame(buf), { status: 'bad-length' })
})

test('rejects a length above 1024', () => {
  const buf = Buffer.alloc(4)
  buf.writeUInt16LE(PROBE_FRAME_MAX_LENGTH + 1, 2)
  assert.equal(PROBE_FRAME_MAX_LENGTH, 1024)
  assert.deepEqual(readProbeFrame(buf), { status: 'bad-length' })
})

test('accepts a frame whose length is exactly 1024 once those bytes exist', () => {
  const buf = Buffer.alloc(1024)
  buf.writeUInt16LE(1024, 2)
  const read = readProbeFrame(buf)
  assert.equal(read.status, 'frame')
  assert.equal(read.frame.length, 1024)
})
