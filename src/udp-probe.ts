import type { DeviceConfig } from './types'
import { DeviceProtocolEnum } from './types'
import type { InstanceStatus } from '@companion-module/base'
import { InstanceStatus as Status, UDPHelper } from '@companion-module/base'
import { logger } from './log'

/**
 * Parsed result of a single 0xEA UDP probe response.
 */
export interface ProbeResult {
  /**
   * Device model byte.
   *  - deviceType 1/2: 0xEA offset 23
   *  - deviceType 0: 0xF1 secondary response offset 12 (resolved by Connection;
   *    0 = the secondary query timed out / failed and the model is unknown)
   * Resolved to a registry entry via `resolveDeviceModel` (src/device-models.ts).
   */
  model: number
  /** Device type byte (0xEA offset 22): 0=Sender card / 1=Player box / 2=Processor */
  deviceType: 0 | 1 | 2
  /** Raw response buffer — kept for debugging */
  raw: Buffer
}

export function getProtocolForDeviceType(deviceType: number): DeviceConfig['protocol'] | undefined {
  return deviceType === 2 ? DeviceProtocolEnum.B : DeviceProtocolEnum.A
}

/**
 * Builds the 9-byte 0xEB probe request.
 *
 * Layout (per protocol doc §6.2.1):
 *   [0]    0xEB         Frame number
 *   [1]    0x00         Reserved
 *   [2..3] 0x00 0x09    Frame length (LE)
 *   [4]    0x01         Sub-frame type = search IP device
 *   [5..7] 0x55 0xEE 0xCC Frame data
 *   [8]    0x00         CRC (not enabled)
 */
export function buildProbeRequest(): Buffer {
  return Buffer.from([0xeb, 0x00, 0x00, 0x09, 0x01, 0x55, 0xee, 0xcc, 0x00])
}

/**
 * Builds the 17-byte sender-card model query request — the second probe
 * stage, sent when the 0xEA deviceType byte is 0 (sender cards do not carry
 * the model in the 0xEA frame).
 *
 * Layout (fixed frame, no CRC):
 *   [0]    0x01         Frame number
 *   [1]    0x00         Reserved
 *   [2..3] 0x11 0x00    Frame length (LE) = 17
 *   [4..16] fixed payload 00 00 00 00 ff 00 00 00 00 00 01 00 16
 *
 * The device answers with an 0xF1-prefixed reply (parseSenderModelResponse).
 */
export function buildSenderModelRequest(): Buffer {
  return Buffer.from([
    0x01, 0x00, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x16
  ])
}

/**
 * Parses the 0xF1-prefixed reply to buildSenderModelRequest(). Returns the
 * device model byte (offset 12) or `null` if the packet is too short or has
 * a wrong frame id.
 */
export function parseSenderModelResponse(buf: Buffer): number | null {
  if (!buf || buf.length < 13) return null
  if (buf[0] !== 0xf1) return null
  return buf[12]
}

/**
 * Parses an 0xEA probe response. Returns `null` if the packet is too short,
 * has a wrong frame id, or otherwise malformed.
 *
 * Only `model` and `deviceType` are extracted; other fields are intentionally
 * ignored. Note: for deviceType 0 the returned `model` (offset 23) is NOT
 * meaningful — Connection replaces it via the secondary 0xF1 model query
 * (see buildSenderModelRequest).
 */
export function parseProbeResponse(buf: Buffer): ProbeResult | null {
  // offset 22 (deviceType) must be readable → require ≥23 bytes. Some devices
  // (e.g. sender cards) reply with exactly 23 bytes and no model byte at all;
  // those report model=0 here — for deviceType 0 the real model comes from the
  // secondary 0xF1 query anyway.
  if (!buf || buf.length < 23) return null
  if (buf[0] !== 0xea) return null
  return {
    model: buf.length > 23 ? buf[23] : -1,
    deviceType: buf[22] as ProbeResult['deviceType'],
    raw: Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  }
}

export const UDP_PROBE_PORT = 9099

const DEFAULT_PROBE_TIMEOUT_MS = 1500
const DEFAULT_RETRY_DELAY_MS = 2000

export interface UdpProbeSocket {
  sendAsync(message: Buffer): Promise<boolean | void>
  destroy(): void
  on(event: 'data', listener: (msg: Buffer) => void): void
  on(event: 'error', listener: (err: Error) => void): void
  on(event: 'status_change', listener: (status: InstanceStatus, message?: string) => void): void
}

export interface UdpProbeOptions {
  socketFactory?: (host: string, port: number) => UdpProbeSocket
  probeTimeoutMs?: number
  retryDelayMs?: number
}

type ProbePhase = 'idle' | 'await-ea' | 'await-model' | 'retry-wait'

/**
 * One-shot UDP discovery on port 9099.
 * Success destroys the socket and calls onResult once.
 * Failure retries; it does not call onResult.
 */
export class UdpProbe {
  private readonly socketFactory: (host: string, port: number) => UdpProbeSocket
  private readonly probeTimeoutMs: number
  private readonly retryDelayMs: number
  private socket: UdpProbeSocket | null = null
  private timer: NodeJS.Timeout | null = null
  private onResult: ((result: ProbeResult) => void) | null = null
  private host = ''
  private running = false
  private generation = 0
  private sendTicket = 0
  private phase: ProbePhase = 'idle'
  private pendingProbe: ProbeResult | null = null

  constructor(options: UdpProbeOptions = {}) {
    this.socketFactory =
      options.socketFactory ?? ((host, port) => new UDPHelper(host, port, {}) as unknown as UdpProbeSocket)
    this.probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  }

  public setOnResult(cb: ((result: ProbeResult) => void) | null): void {
    this.onResult = cb
  }

  public start(host: string): void {
    this.stop()
    this.host = host
    this.running = true
    this.openAndFire()
  }

  public stop(): void {
    this.generation++
    this.sendTicket++
    this.running = false
    this.phase = 'idle'
    this.pendingProbe = null
    this.host = ''
    this.clearTimer()
    this.destroySocket()
  }

  private openAndFire(): void {
    this.destroySocket()
    this.socket = this.socketFactory(this.host, UDP_PROBE_PORT)
    this.bind(this.socket, this.generation)
    this.fireProbe()
  }

  private bind(socket: UdpProbeSocket, generation: number): void {
    const current = (): boolean => generation === this.generation && this.running
    socket.on('data', (buf: Buffer) => {
      if (!current()) return
      this.onDatagram(buf)
    })
    socket.on('error', (err: Error) => {
      if (!current()) return
      this.failSocket(err.message)
    })
    socket.on('status_change', (status: InstanceStatus) => {
      if (!current()) return
      if (status === Status.UnknownError) this.failSocket('UnknownError')
    })
  }

  private fireProbe(): void {
    this.phase = 'await-ea'
    this.pendingProbe = null
    this.sendTicket++
    const ticket = this.sendTicket
    const generation = this.generation
    logger.info(`UDP probe: sending 0xEB to ${this.host}:${UDP_PROBE_PORT}`)
    this.armTimeout(generation, '0xEB')
    void this.send(buildProbeRequest(), ticket)
  }

  private startModelQuery(parsed: ProbeResult): void {
    this.pendingProbe = { ...parsed, model: 0 }
    this.phase = 'await-model'
    this.sendTicket++
    const ticket = this.sendTicket
    const generation = this.generation
    logger.info('UDP probe: deviceType=0; sending model query')
    this.armTimeout(generation, 'model')
    void this.send(buildSenderModelRequest(), ticket)
  }

  private async send(payload: Buffer, ticket: number): Promise<void> {
    const socket = this.socket
    if (!socket) {
      this.failRound()
      return
    }
    try {
      const ok = await socket.sendAsync(payload)
      if (ticket !== this.sendTicket || !this.running) return
      if (ok === false) this.failRound()
    } catch (err) {
      if (ticket !== this.sendTicket || !this.running) return
      logger.warn(`UDP probe send failed: ${(err as Error).message ?? String(err)}`)
      this.failRound()
    }
  }

  private onDatagram(buf: Buffer): void {
    if (buf.length === 0) return
    if ((this.phase === 'await-ea' || this.phase === 'retry-wait') && buf[0] === 0xea) {
      const parsed = parseProbeResponse(buf)
      if (!parsed) {
        logger.warn(`UDP probe: dropping malformed 0xEA (length=${buf.length})`)
        return
      }
      if (this.phase === 'retry-wait') this.clearTimer()
      if (parsed.deviceType === 0) this.startModelQuery(parsed)
      else this.succeed(parsed)
      return
    }
    if (this.phase === 'await-model' && buf[0] === 0xea) {
      logger.debug('UDP probe: duplicate 0xEA during model query; ignoring')
      return
    }
    if (this.phase === 'await-model' && buf[0] === 0xf1) {
      const model = parseSenderModelResponse(buf)
      if (model === null || !this.pendingProbe) {
        logger.warn(`UDP probe: dropping malformed 0xF1 (length=${buf.length})`)
        return
      }
      this.succeed({ ...this.pendingProbe, model })
    }
  }

  private succeed(result: ProbeResult): void {
    if (!this.running) return
    const cb = this.onResult
    this.generation++
    this.sendTicket++
    this.running = false
    this.phase = 'idle'
    this.pendingProbe = null
    this.clearTimer()
    this.destroySocket()
    logger.info(`UDP probe resolved, model=0x${result.model.toString(16)}, deviceType=${result.deviceType}`)
    try {
      cb?.(result)
    } catch (err) {
      logger.error(`UDP probe result callback threw: ${(err as Error).message ?? String(err)}`)
    }
  }

  private failRound(): void {
    if (!this.running) return
    if (this.phase !== 'await-ea' && this.phase !== 'await-model') return
    this.sendTicket++
    this.pendingProbe = null
    this.phase = 'retry-wait'
    this.clearTimer()
    logger.warn(`UDP probe failed; retrying full probe (host=${this.host}:${UDP_PROBE_PORT})`)
    this.scheduleRetry(false)
  }

  private failSocket(message: string): void {
    if (!this.running) return
    logger.error(`UDP probe socket error: ${message}`)
    this.generation++
    this.sendTicket++
    this.pendingProbe = null
    this.phase = 'idle'
    this.clearTimer()
    this.destroySocket()
    this.scheduleRetry(true)
  }

  private scheduleRetry(replaceSocket: boolean): void {
    if (!this.running || this.timer) return
    const generation = this.generation
    this.timer = setTimeout(() => {
      this.timer = null
      if (generation !== this.generation || !this.running) return
      if (replaceSocket || !this.socket) this.openAndFire()
      else this.fireProbe()
    }, this.retryDelayMs)
  }

  private armTimeout(generation: number, label: string): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      if (generation !== this.generation || !this.running) return
      logger.warn(`UDP probe timeout after ${this.probeTimeoutMs}ms (${label})`)
      this.failRound()
    }, this.probeTimeoutMs)
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private destroySocket(): void {
    if (!this.socket) return
    const dead = this.socket
    this.socket = null
    dead.destroy()
  }
}
