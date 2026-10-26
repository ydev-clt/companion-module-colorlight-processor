const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { InstanceStatus } = require('@companion-module/base')
const { Connection } = require('../dist/connection')
const { defaultConfig } = require('../dist/config')
const { buildProbeRequest } = require('../dist/udp-probe')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class FakeUdp extends EventEmitter {
  constructor(host, port) {
    super()
    this.host = host
    this.port = port
    this.sent = []
    this.destroyed = false
  }

  sendAsync(message) {
    this.sent.push(Buffer.from(message))
    return Promise.resolve()
  }

  destroy() {
    this.destroyed = true
  }
}

class FakeTcp extends EventEmitter {
  constructor(host, port) {
    super()
    this.host = host
    this.port = port
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

function ea(deviceType, model) {
  const buf = Buffer.alloc(24)
  buf[0] = 0xea
  buf[22] = deviceType
  buf[23] = model
  return buf
}

function harness(options = {}) {
  const udps = []
  const tcps = []
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
      udpSocketFactory: (host, port) => {
        const socket = new FakeUdp(host, port)
        udps.push(socket)
        return socket
      },
      tcpSocketFactory: (host, port) => {
        const socket = new FakeTcp(host, port)
        tcps.push(socket)
        return socket
      },
      ...options
    }
  )
  conn.setOnProbeResult((result) => probes.push(result))
  conn.setOnLinkLost(() => linkLosses.push('lost'))
  return { conn, udps, tcps, incoming, statuses, probes, linkLosses }
}

function discover(udp, deviceType = 2, model = 1) {
  udp.emit('data', ea(deviceType, model))
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

test('opens UDP first and delivers the probe only after TCP connects', async () => {
  const { conn, udps, tcps, probes, statuses } = harness()
  conn.open('127.0.0.1', 9999)
  await delay(10)
  assert.equal(udps.length, 1)
  assert.equal(udps[0].port, 9099)
  assert.deepEqual(udps[0].sent[0], buildProbeRequest())
  assert.equal(tcps.length, 0)
  assert.deepEqual(statuses, [InstanceStatus.Connecting])
  discover(udps[0], 2, 34)
  await delay(10)
  assert.equal(udps[0].destroyed, true)
  assert.equal(tcps.length, 1)
  assert.equal(tcps[0].host, '127.0.0.1')
  assert.equal(tcps[0].port, 9999)
  assert.equal(probes.length, 0)
  assert.deepEqual(statuses, [InstanceStatus.Connecting])
  tcps[0].isConnected = true
  tcps[0].emit('connect')
  await delay(10)
  assert.deepEqual(
    tcps[0].sent[0],
    Buffer.from([
      0x82, 0x00, 0x00, 0x15, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x01, 0x9d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x03, 0x9d
    ])
  )
  assert.equal(tcps[0].sent.length, 1)
  tcps[0].emit('connect')
  await delay(10)
  assert.equal(tcps[0].sent.length, 1)
  assert.equal(probes.length, 1)
  assert.equal(probes[0].deviceType, 2)
  assert.equal(probes[0].model, 34)
  assert.deepEqual(statuses, [InstanceStatus.Connecting, InstanceStatus.Ok])
  conn.close()
})

test('drops TCP bytes until beginReceiving, then forwards whole chunks', async () => {
  const { conn, udps, tcps, incoming } = harness()
  conn.open('127.0.0.1', 9999)
  await delay(10)
  discover(udps[0])
  await delay(10)
  tcps[0].isConnected = true
  tcps[0].emit('connect')
  tcps[0].emit('data', Buffer.from([0xab]))
  assert.equal(incoming.length, 0)
  conn.beginReceiving()
  tcps[0].emit('data', Buffer.from([0x0a, 0x0b]))
  assert.equal(incoming.length, 1)
  assert.deepEqual(incoming[0], Buffer.from([0x0a, 0x0b]))
  conn.close()
})

test('send returns false before business and writes the TCP socket afterward', async () => {
  const { conn, udps, tcps } = harness()
  conn.open('127.0.0.1', 9999)
  assert.equal(await conn.send(Buffer.from([1])), false)
  await delay(10)
  discover(udps[0])
  await delay(10)
  assert.equal(await conn.send(Buffer.from([2])), false)
  tcps[0].isConnected = true
  tcps[0].emit('connect')
  assert.equal(await conn.send(Buffer.from([3])), false)
  conn.beginReceiving()
  assert.equal(await conn.send(Buffer.from([4])), true)
  assert.deepEqual(tcps[0].sent.at(-1), Buffer.from([4]))
  conn.close()
})

test('a failed business send returns false and leaves the TCP socket up', async () => {
  const { conn, udps, tcps, linkLosses } = harness()
  conn.open('127.0.0.1', 9999)
  await delay(10)
  discover(udps[0])
  await delay(10)
  tcps[0].isConnected = true
  tcps[0].emit('connect')
  conn.beginReceiving()
  tcps[0].sendAsync = () => Promise.reject(new Error('write failed'))
  assert.equal(await conn.send(Buffer.from([9])), false)
  assert.deepEqual(linkLosses, [])
  assert.equal(tcps[0].destroyed, false)
  conn.close()
})

test('TCP loss before delivery probes again on a new UDP socket', async () => {
  const { conn, udps, tcps, probes, linkLosses } = harness()
  conn.open('127.0.0.1', 9999)
  await delay(10)
  discover(udps[0], 2, 7)
  await delay(10)
  tcps[0].emit('error', new Error('down'))
  await delay(20)
  assert.deepEqual(linkLosses, [])
  assert.equal(probes.length, 0)
  assert.equal(tcps[0].destroyed, true)
  await delay(80)
  assert.equal(udps.length, 2)
  assert.equal(udps[1].port, 9099)
  assert.deepEqual(udps[1].sent[0], buildProbeRequest())
  assert.equal(tcps.length, 1)
  discover(udps[1], 2, 8)
  await delay(10)
  assert.equal(probes.length, 0)
  tcps[1].isConnected = true
  tcps[1].emit('connect')
  await delay(10)
  assert.equal(probes.length, 1)
  assert.equal(probes[0].model, 8)
  conn.close()
})

test('TCP loss after delivery reports link loss once and waits for reconnect', async () => {
  const { conn, udps, tcps, linkLosses } = harness()
  conn.open('127.0.0.1', 9999)
  await delay(10)
  discover(udps[0])
  await delay(10)
  tcps[0].isConnected = true
  tcps[0].emit('connect')
  tcps[0].emit('error', new Error('down'))
  tcps[0].emit('error', new Error('down again'))
  await delay(80)
  assert.deepEqual(linkLosses, ['lost'])
  assert.equal(udps.length, 1)
  conn.reconnect()
  await delay(20)
  assert.equal(udps.length, 1)
  await delay(80)
  assert.equal(udps.length, 2)
  assert.equal(udps[1].port, 9099)
  assert.deepEqual(udps[1].sent[0], buildProbeRequest())
  conn.close()
})

test('close produces neither a probe result nor link loss', async () => {
  const { conn, udps, probes, linkLosses } = harness()
  conn.open('127.0.0.1', 9999)
  await delay(10)
  conn.close()
  udps[0].emit('data', ea(2, 1))
  udps[0].emit('error', new Error('down'))
  await delay(80)
  assert.deepEqual(probes, [])
  assert.deepEqual(linkLosses, [])
})

test('a throwing probe callback still reports a later TCP loss', async () => {
  const { conn, udps, tcps, linkLosses } = harness()
  conn.setOnProbeResult(() => {
    throw new Error('boom')
  })
  conn.open('127.0.0.1', 9999)
  await delay(10)
  discover(udps[0])
  await delay(10)
  tcps[0].isConnected = true
  tcps[0].emit('connect')
  await delay(10)
  tcps[0].emit('end')
  assert.deepEqual(linkLosses, ['lost'])
  conn.close()
})
