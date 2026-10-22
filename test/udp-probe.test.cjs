const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { UdpProbe, buildProbeRequest, buildSenderModelRequest } = require('../dist/udp-probe')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class FakeUdp extends EventEmitter {
  constructor(host, port) {
    super()
    this.host = host
    this.port = port
    this.sent = []
    this.destroyed = false
    this.sendImpl = null
  }

  sendAsync(message) {
    this.sent.push(Buffer.from(message))
    if (this.sendImpl) return this.sendImpl(message)
    return Promise.resolve()
  }

  destroy() {
    this.destroyed = true
  }
}

function ea(deviceType, model) {
  const buf = Buffer.alloc(24)
  buf[0] = 0xea
  buf[22] = deviceType
  buf[23] = model
  return buf
}

function f1(model) {
  const buf = Buffer.alloc(13)
  buf[0] = 0xf1
  buf[12] = model
  return buf
}

function harness(options = {}) {
  const sockets = []
  const results = []
  const probe = new UdpProbe({
    probeTimeoutMs: options.probeTimeoutMs ?? 40,
    retryDelayMs: options.retryDelayMs ?? 40,
    socketFactory: (host, port) => {
      const socket = new FakeUdp(host, port)
      if (options.decorate) options.decorate(socket)
      sockets.push(socket)
      return socket
    }
  })
  probe.setOnResult((result) => results.push(result))
  return { probe, sockets, results }
}

test('sends 0xEB to port 9099 immediately', async () => {
  const { probe, sockets } = harness()
  probe.start('10.0.0.8')
  await delay(10)
  assert.equal(sockets.length, 1)
  assert.equal(sockets[0].host, '10.0.0.8')
  assert.equal(sockets[0].port, 9099)
  assert.deepEqual(sockets[0].sent[0], buildProbeRequest())
  probe.stop()
})

test('resolves a non-sender 0xEA once and destroys the socket', async () => {
  const { probe, sockets, results } = harness()
  probe.start('10.0.0.8')
  await delay(10)
  sockets[0].emit('data', ea(2, 34))
  await delay(10)
  assert.equal(results.length, 1)
  assert.equal(results[0].deviceType, 2)
  assert.equal(results[0].model, 34)
  assert.equal(sockets[0].destroyed, true)
  sockets[0].emit('data', ea(2, 99))
  await delay(10)
  assert.equal(results.length, 1)
  probe.stop()
})

test('device type 0 queries the model and ignores a duplicate 0xEA', async () => {
  const { probe, sockets, results } = harness()
  probe.start('10.0.0.8')
  await delay(10)
  sockets[0].emit('data', ea(0, 99))
  await delay(10)
  assert.equal(results.length, 0)
  assert.deepEqual(sockets[0].sent[1], buildSenderModelRequest())
  sockets[0].emit('data', ea(0, 1))
  sockets[0].emit('data', f1(50))
  await delay(10)
  assert.equal(results.length, 1)
  assert.equal(results[0].deviceType, 0)
  assert.equal(results[0].model, 50)
  assert.equal(sockets[0].destroyed, true)
  probe.stop()
})

test('keeps waiting after malformed probe frames and other datagrams', async () => {
  const { probe, sockets, results } = harness({ probeTimeoutMs: 300, retryDelayMs: 300 })
  probe.start('10.0.0.8')
  await delay(10)
  sockets[0].emit('data', Buffer.from([0xea, 0x00]))
  sockets[0].emit('data', Buffer.from([0x11, 0x22]))
  await delay(10)
  assert.equal(results.length, 0)
  assert.equal(sockets[0].destroyed, false)
  sockets[0].emit('data', ea(0, 1))
  await delay(10)
  sockets[0].emit('data', Buffer.from([0xf1, 0x00]))
  sockets[0].emit('data', Buffer.from([0x99]))
  await delay(10)
  assert.equal(results.length, 0)
  sockets[0].emit('data', f1(8))
  await delay(10)
  assert.equal(results[0].deviceType, 0)
  assert.equal(results[0].model, 8)
  probe.stop()
})

test('retries 0xEB on the same socket after timeout', async () => {
  const { probe, sockets, results } = harness()
  probe.start('10.0.0.8')
  await delay(120)
  assert.equal(results.length, 0)
  assert.equal(sockets.length, 1)
  assert.equal(sockets[0].destroyed, false)
  assert.ok(sockets[0].sent.length >= 2)
  assert.deepEqual(sockets[0].sent.at(-1), buildProbeRequest())
  probe.stop()
})

test('a false send retries 0xEB on the same socket', async () => {
  const { probe, sockets, results } = harness({
    probeTimeoutMs: 300,
    decorate(socket) {
      socket.sendImpl = () => {
        if (socket.sent.length === 1) return Promise.resolve(false)
        return Promise.resolve()
      }
    }
  })
  probe.start('10.0.0.8')
  await delay(80)
  assert.equal(results.length, 0)
  assert.equal(sockets.length, 1)
  assert.equal(sockets[0].destroyed, false)
  assert.deepEqual(sockets[0].sent.at(-1), buildProbeRequest())
  assert.ok(sockets[0].sent.length >= 2)
  probe.stop()
})

test('a rejected send retries 0xEB on the same socket', async () => {
  const { probe, sockets, results } = harness({
    probeTimeoutMs: 300,
    decorate(socket) {
      socket.sendImpl = () => {
        if (socket.sent.length === 1) return Promise.reject(new Error('send failed'))
        return Promise.resolve()
      }
    }
  })
  probe.start('10.0.0.8')
  await delay(80)
  assert.equal(results.length, 0)
  assert.equal(sockets.length, 1)
  assert.deepEqual(sockets[0].sent.at(-1), buildProbeRequest())
  probe.stop()
})

test('a failed model query retries from 0xEB', async () => {
  const { probe, sockets, results } = harness({
    probeTimeoutMs: 300,
    decorate(socket) {
      socket.sendImpl = () => {
        if (socket.sent.length === 2) return Promise.resolve(false)
        return Promise.resolve()
      }
    }
  })
  probe.start('10.0.0.8')
  await delay(10)
  sockets[0].emit('data', ea(0, 1))
  await delay(80)
  assert.equal(results.length, 0)
  assert.equal(sockets.length, 1)
  assert.deepEqual(sockets[0].sent[2], buildProbeRequest())
  probe.stop()
})

test('a socket error opens one new socket and probes again', async () => {
  const { probe, sockets, results } = harness({ probeTimeoutMs: 300, retryDelayMs: 40 })
  probe.start('10.0.0.8')
  await delay(10)
  sockets[0].emit('error', new Error('down'))
  await delay(80)
  assert.equal(results.length, 0)
  assert.equal(sockets[0].destroyed, true)
  assert.equal(sockets.length, 2)
  assert.equal(sockets[1].port, 9099)
  assert.deepEqual(sockets[1].sent[0], buildProbeRequest())
  probe.stop()
})

test('UnknownError opens one new socket', async () => {
  const { InstanceStatus } = require('@companion-module/base')
  const { probe, sockets } = harness({ probeTimeoutMs: 300 })
  probe.start('10.0.0.8')
  await delay(10)
  sockets[0].emit('status_change', InstanceStatus.UnknownError, undefined)
  await delay(80)
  assert.equal(sockets.length, 2)
  assert.equal(sockets[0].destroyed, true)
  assert.deepEqual(sockets[1].sent[0], buildProbeRequest())
  probe.stop()
})

test('a socket error during retry wait schedules one replacement', async () => {
  const { probe, sockets, results } = harness({ probeTimeoutMs: 30, retryDelayMs: 200 })
  probe.start('10.0.0.8')
  await delay(50)
  assert.equal(sockets.length, 1)
  sockets[0].emit('error', new Error('down'))
  await delay(40)
  assert.equal(sockets.length, 1)
  await delay(180)
  assert.equal(sockets.length, 2)
  assert.equal(sockets[1].sent.length, 1)
  await delay(250)
  assert.equal(sockets.length, 2)
  assert.equal(results.length, 0)
  probe.stop()
})

test('a valid 0xEA during retry wait completes that round', async () => {
  const { probe, sockets, results } = harness({ probeTimeoutMs: 30, retryDelayMs: 200 })
  probe.start('10.0.0.8')
  await delay(50)
  assert.equal(sockets[0].sent.length, 1)
  sockets[0].emit('data', ea(2, 4))
  await delay(20)
  assert.equal(results.length, 1)
  assert.equal(results[0].model, 4)
  assert.equal(sockets[0].sent.length, 1)
  assert.equal(sockets[0].destroyed, true)
  probe.stop()
})

test('a sender 0xEA during retry wait starts the model query', async () => {
  const { probe, sockets, results } = harness({ probeTimeoutMs: 30, retryDelayMs: 200 })
  probe.start('10.0.0.8')
  await delay(50)
  sockets[0].emit('data', ea(0, 9))
  await delay(20)
  assert.equal(results.length, 0)
  assert.deepEqual(sockets[0].sent.at(-1), buildSenderModelRequest())
  sockets[0].emit('data', f1(12))
  await delay(10)
  assert.equal(results[0].deviceType, 0)
  assert.equal(results[0].model, 12)
  probe.stop()
})

test('stop ignores a late datagram, send result, and timeout', async () => {
  const sockets = []
  const results = []
  let release = () => {}
  const probe = new UdpProbe({
    probeTimeoutMs: 40,
    retryDelayMs: 40,
    socketFactory: (host, port) => {
      const socket = new FakeUdp(host, port)
      socket.sendImpl = () =>
        new Promise((resolve) => {
          release = () => resolve(false)
        })
      sockets.push(socket)
      return socket
    }
  })
  probe.setOnResult((result) => results.push(result))
  probe.start('10.0.0.8')
  await delay(10)
  probe.stop()
  sockets[0].emit('data', ea(2, 1))
  release()
  await delay(100)
  assert.equal(results.length, 0)
  assert.equal(sockets.length, 1)
  assert.equal(sockets[0].destroyed, true)
  probe.stop()
})

test('a second start ignores packets from the first socket', async () => {
  const { probe, sockets, results } = harness()
  probe.start('1.1.1.1')
  await delay(10)
  const first = sockets[0]
  probe.start('2.2.2.2')
  await delay(10)
  first.emit('data', ea(2, 1))
  await delay(10)
  assert.equal(results.length, 0)
  assert.equal(first.destroyed, true)
  sockets[1].emit('data', ea(2, 5))
  await delay(10)
  assert.equal(results.length, 1)
  assert.equal(results[0].model, 5)
  assert.equal(sockets[1].host, '2.2.2.2')
  probe.stop()
})

test('start inside the result callback opens a new probe', async () => {
  const sockets = []
  const probe = new UdpProbe({
    probeTimeoutMs: 40,
    retryDelayMs: 40,
    socketFactory: (host, port) => {
      const socket = new FakeUdp(host, port)
      sockets.push(socket)
      return socket
    }
  })
  let starts = 0
  probe.setOnResult(() => {
    starts += 1
    if (starts === 1) probe.start('10.0.0.9')
  })
  probe.start('10.0.0.8')
  await delay(10)
  sockets[0].emit('data', ea(2, 1))
  await delay(10)
  assert.equal(starts, 1)
  assert.equal(sockets.length, 2)
  assert.equal(sockets[1].host, '10.0.0.9')
  assert.equal(sockets[1].port, 9099)
  assert.deepEqual(sockets[1].sent[0], buildProbeRequest())
  probe.stop()
})
