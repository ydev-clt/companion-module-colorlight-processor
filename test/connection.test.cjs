const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Connection } = require('../dist/connection')
const { defaultConfig } = require('../dist/config')
const { buildProbeRequest, buildSenderModelRequest } = require('../dist/udp-probe')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class FakeTcp extends EventEmitter {
  constructor() {
    super()
    this.sent = []
    this.isConnected = false
    this.destroyed = false
  }
  sendAsync(message) {
    this.sent.push(Buffer.from(message))
    return Promise.resolve(this.isConnected)
  }
  destroy() {
    this.destroyed = true
    this.isConnected = false
  }
}

function harness(options = {}) {
  const sockets = []
  const incoming = []
  const statuses = []
  const probes = []
  const linkLosses = []
  const conn = new Connection(
    {
      config: { host: '127.0.0.1', port: 9999, protocol: 'None' },
      handleIncoming: (buf) => incoming.push(Buffer.from(buf)),
      updateStatus: (status) => statuses.push(status)
    },
    {
      probeTimeoutMs: 40,
      retryDelayMs: 40,
      socketFactory: () => {
        const socket = new FakeTcp()
        sockets.push(socket)
        return socket
      },
      ...options
    }
  )
  conn.setOnProbeResult((result) => probes.push(result))
  conn.setOnLinkLost(() => linkLosses.push('lost'))
  return { conn, sockets, incoming, statuses, probes, linkLosses }
}

function connect(socket) {
  socket.isConnected = true
  socket.emit('connect')
}

function ea(deviceType, model) {
  const buf = Buffer.alloc(24)
  buf[0] = 0xea
  buf.writeUInt16LE(24, 2)
  buf[22] = deviceType
  buf[23] = model
  return buf
}

function f1(model) {
  const buf = Buffer.alloc(13)
  buf[0] = 0xf1
  buf.writeUInt16LE(13, 2)
  buf[12] = model
  return buf
}

test('default port is 9999', () => {
  assert.equal(defaultConfig.port, 9999)
})

test('exposes the TCP session hooks', () => {
  const { conn } = harness()
  assert.equal(typeof conn.beginReceiving, 'function')
  assert.equal(typeof conn.setOnLinkLost, 'function')
  assert.equal(typeof conn.reconnect, 'function')
  conn.close()
})

test('sends 0xEB only after connect and reassembles a split 0xEA', async () => {
  const { conn, sockets, probes } = harness()
  conn.open('127.0.0.1', 9999)
  assert.equal(sockets[0].sent.length, 0)
  connect(sockets[0])
  await delay(10)
  assert.deepEqual(sockets[0].sent[0], buildProbeRequest())
  const frame = ea(2, 34)
  sockets[0].emit('data', frame.subarray(0, 10))
  await delay(10)
  assert.equal(probes.length, 0)
  sockets[0].emit('data', frame.subarray(10))
  await delay(10)
  assert.equal(probes.length, 1)
  assert.equal(probes[0].deviceType, 2)
  assert.equal(probes[0].model, 34)
  conn.close()
})

test('device type 0 sends the 17-byte model query and uses the 0xF1 model', async () => {
  const { conn, sockets, probes } = harness()
  conn.open('127.0.0.1', 9999)
  connect(sockets[0])
  await delay(10)
  sockets[0].emit('data', ea(0, 99))
  await delay(10)
  assert.equal(probes.length, 0)
  assert.deepEqual(sockets[0].sent[1], buildSenderModelRequest())
  sockets[0].emit('data', f1(50))
  await delay(10)
  assert.equal(probes[0].deviceType, 0)
  assert.equal(probes[0].model, 50)
  conn.close()
})

test('drops bytes until beginReceiving, then forwards whole chunks', async () => {
  const { conn, sockets, incoming } = harness()
  conn.open('127.0.0.1', 9999)
  connect(sockets[0])
  await delay(10)
  const frame = ea(2, 1)
  sockets[0].emit('data', Buffer.concat([frame, Buffer.from([0xab])]))
  await delay(10)
  sockets[0].emit('data', Buffer.from([0x01, 0x02]))
  assert.equal(incoming.length, 0)
  conn.beginReceiving()
  sockets[0].emit('data', Buffer.from([0x0a, 0x0b]))
  assert.equal(incoming.length, 1)
  assert.deepEqual(incoming[0], Buffer.from([0x0a, 0x0b]))
  conn.close()
})

test('retries 0xEB on the same socket when the probe times out', async () => {
  const { conn, sockets, probes } = harness()
  conn.open('127.0.0.1', 9999)
  connect(sockets[0])
  await delay(120)
  assert.equal(probes.length, 0)
  assert.ok(sockets[0].sent.length >= 2)
  assert.deepEqual(sockets[0].sent[1], buildProbeRequest())
  assert.equal(sockets.length, 1)
  conn.close()
})

test('reconnects without link-loss when the socket dies before a probe result', async () => {
  const { conn, sockets, linkLosses } = harness()
  conn.open('127.0.0.1', 9999)
  connect(sockets[0])
  await delay(10)
  sockets[0].emit('error', new Error('down'))
  await delay(80)
  assert.deepEqual(linkLosses, [])
  assert.equal(sockets.length, 2)
  conn.close()
})

test('reports link loss once after a successful probe and reconnects only when asked', async () => {
  const { conn, sockets, linkLosses } = harness()
  conn.setOnLinkLost(() => {
    linkLosses.push('lost')
    conn.reconnect()
  })
  conn.open('127.0.0.1', 9999)
  connect(sockets[0])
  await delay(10)
  sockets[0].emit('data', ea(2, 1))
  await delay(10)
  sockets[0].emit('error', new Error('down'))
  sockets[0].emit('error', new Error('down again'))
  await delay(20)
  assert.deepEqual(linkLosses, ['lost'])
  assert.equal(sockets.length, 1)
  await delay(80)
  assert.equal(sockets.length, 2)
  conn.close()
})

test('send returns false before beginReceiving and true afterward', async () => {
  const { conn, sockets } = harness()
  conn.open('127.0.0.1', 9999)
  connect(sockets[0])
  await delay(10)
  sockets[0].emit('data', ea(2, 1))
  await delay(10)
  assert.equal(await conn.send(Buffer.from([1])), false)
  conn.beginReceiving()
  assert.equal(await conn.send(Buffer.from([2])), true)
  assert.equal(sockets[0].sent[sockets[0].sent.length - 1][0], 2)
  conn.close()
})
