import type { ConnectionContext } from './types'
import type { InstanceStatus } from '@companion-module/base'
import { TCPHelper as TCPHelperCtor, InstanceStatus as Status } from '@companion-module/base'
import { logger } from './log'
import {
  buildProbeRequest,
  buildSenderModelRequest,
  parseProbeResponse,
  parseSenderModelResponse,
  type ProbeResult
} from './udp-probe'
import { readProbeFrame } from './tcp-probe-frame'

const DEFAULT_PROBE_TIMEOUT_MS = 1500
const DEFAULT_RETRY_DELAY_MS = 2000

export interface ProbeSocket {
  readonly isConnected: boolean
  sendAsync(message: Buffer): Promise<boolean>
  destroy(): void
  on(event: 'data', listener: (msg: Buffer) => void): void
  on(event: 'error', listener: (err: Error) => void): void
  on(event: 'connect', listener: () => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'status_change', listener: (status: InstanceStatus, message: string | undefined) => void): void
}

export interface ConnectionOptions {
  socketFactory?: (host: string, port: number) => ProbeSocket
  probeTimeoutMs?: number
  retryDelayMs?: number
}

type Phase = 'closed' | 'probe-wait' | 'retry-wait' | 'holding' | 'business'

/**
 * TCP transport plus a one-shot 0xEB / 0xF1 probe.
 * Auto-reconnect on TCPHelper stays off. This object schedules the one retry.
 */
class Connection {
  private context: ConnectionContext
  private socket: ProbeSocket | null = null
  private readonly socketFactory: (host: string, port: number) => ProbeSocket
  private readonly probeTimeoutMs: number
  private readonly retryDelayMs: number

  private probeTimer: NodeJS.Timeout | null = null
  private retryTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private probeClosed = true
  private probeGeneration = 0
  private probeHost = ''
  private probePort = 0
  private onProbeResult: ((result: ProbeResult | null) => void) | null = null
  private onLinkLost: (() => void) | null = null
  private deliveredThisConnection = false
  private awaitingModel = false
  private pendingProbe: ProbeResult | null = null
  private phase: Phase = 'closed'
  private rx: Buffer = Buffer.alloc(0)
  private publishedStatus: Status | null = null

  constructor(context: ConnectionContext, options: ConnectionOptions = {}) {
    this.context = context
    this.socketFactory =
      options.socketFactory ??
      ((host, port) => new TCPHelperCtor(host, port, { reconnect: false }) as ProbeSocket)
    this.probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  }

  public open(host: string, port: number): void {
    this.close()
    this.probeGeneration++
    this.probeHost = host
    this.probePort = port
    this.probeClosed = false
    this.phase = 'closed'
    this.socket = this.socketFactory(host, port)
    this.bindSocket(this.socket, this.probeGeneration)
    this.publishStatus(Status.Connecting)
    logger.info(`TCP connection opening, host=${host}:${port}`)
  }

  public close(): void {
    this.probeGeneration++
    const hadSocket = this.socket !== null
    this.probeClosed = true
    this.deliveredThisConnection = false
    this.awaitingModel = false
    this.pendingProbe = null
    this.phase = 'closed'
    this.rx = Buffer.alloc(0)
    this.publishedStatus = null
    this.clearTimer('probe')
    this.clearTimer('retry')
    this.clearTimer('reconnect')
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    if (hadSocket) logger.info('Connection closed (TCPHelper destroyed)')
  }

  public reconnect(): void {
    if (this.reconnectTimer) return
    const host = this.probeHost
    const port = this.probePort
    this.close()
    this.publishStatus(Status.Connecting)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!host) return
      this.open(host, port)
    }, this.retryDelayMs)
  }

  public beginReceiving(): void {
    if (this.phase !== 'holding') return
    this.phase = 'business'
    logger.info('TCP business receive started')
  }

  public async send(data: Buffer): Promise<boolean> {
    if (!this.socket || !this.socket.isConnected || this.phase !== 'business') return false
    try {
      logger.debug(`TCP send:${data.toString('hex')}`)
      return (await this.socket.sendAsync(data)) === true
    } catch (err) {
      logger.warn(`TCP send failed: ${(err as Error).message ?? String(err)}`)
      return false
    }
  }

  public setOnProbeResult(cb: ((result: ProbeResult | null) => void) | null): void {
    this.onProbeResult = cb
  }

  public setOnLinkLost(cb: (() => void) | null): void {
    this.onLinkLost = cb
  }

  private publishStatus(status: Status): void {
    if (this.publishedStatus === status) return
    this.publishedStatus = status
    try {
      this.context.updateStatus(status)
    } catch (err) {
      logger.error(`updateStatus threw: ${(err as Error).message ?? String(err)}`)
    }
  }

  private bindSocket(socket: ProbeSocket, generation: number): void {
    const current = (): boolean => generation === this.probeGeneration && !this.probeClosed

    socket.on('connect', () => {
      if (!current()) return
      logger.info(`TCP connected, host=${this.probeHost}:${this.probePort}`)
      this.fireProbe()
    })
    socket.on('data', (buf: Buffer) => {
      if (!current()) return
      this.onData(buf)
    })
    socket.on('error', (err: Error) => {
      if (!current()) return
      logger.error(`TCP connection error: ${err.message}`)
      this.handleSocketDown()
    })
    socket.on('end', () => {
      if (!current()) return
      logger.warn(`TCP connection ended, host=${this.probeHost}:${this.probePort}`)
      this.handleSocketDown()
    })
    socket.on('status_change', (status: InstanceStatus) => {
      if (!current()) return
      if (status === Status.UnknownError || status === Status.Disconnected) this.handleSocketDown()
    })
  }

  private fireProbe(): void {
    if (this.probeClosed || !this.socket) return
    this.awaitingModel = false
    this.pendingProbe = null
    this.rx = Buffer.alloc(0)
    this.phase = 'probe-wait'
    logger.info(`TCP probe: sending 0xEB to ${this.probeHost}:${this.probePort}`)
    void this.sendAndArm(buildProbeRequest(), '0xEB')
  }

  private async sendAndArm(payload: Buffer, label: string): Promise<void> {
    const generation = this.probeGeneration
    const socket = this.socket
    if (!socket) return
    this.clearTimer('probe')
    this.probeTimer = setTimeout(() => {
      if (generation !== this.probeGeneration) return
      logger.warn(`TCP probe timeout after ${this.probeTimeoutMs}ms (${label})`)
      this.failProbeRound()
    }, this.probeTimeoutMs)
    try {
      const ok = await socket.sendAsync(payload)
      if (generation !== this.probeGeneration) return
      if (!ok) this.handleSocketDown()
    } catch (err) {
      if (generation !== this.probeGeneration) return
      logger.warn(`TCP probe send failed (${label}): ${(err as Error).message ?? String(err)}`)
      this.handleSocketDown()
    }
  }

  private onData(buf: Buffer): void {
    if (this.phase === 'business') {
      this.context.handleIncoming(buf)
      return
    }
    if (this.phase !== 'probe-wait') return
    this.rx = Buffer.concat([this.rx, buf])
    this.consumeRx()
  }

  private consumeRx(): void {
    if (this.phase !== 'probe-wait') return
    const read = readProbeFrame(this.rx)
    if (read.status === 'need-header' || read.status === 'need-more') return
    this.rx = Buffer.alloc(0)
    if (read.status === 'bad-length') {
      logger.warn('TCP probe: invalid frame length')
      this.failProbeRound()
      return
    }
    this.onProbeFrame(read.frame)
  }

  private onProbeFrame(frame: Buffer): void {
    if (this.awaitingModel) {
      const model = parseSenderModelResponse(frame)
      if (model === null) return
      const pending = this.pendingProbe
      if (!pending) return
      this.succeed({ ...pending, model })
      return
    }
    const parsed = parseProbeResponse(frame)
    if (!parsed) return
    if (parsed.deviceType === 0) {
      this.awaitingModel = true
      this.pendingProbe = { ...parsed, model: 0 }
      this.clearTimer('probe')
      logger.info('TCP probe: deviceType=0; sending model query')
      void this.sendAndArm(buildSenderModelRequest(), 'model')
      return
    }
    this.succeed(parsed)
  }

  private succeed(result: ProbeResult): void {
    this.clearTimer('probe')
    this.awaitingModel = false
    this.pendingProbe = null
    this.rx = Buffer.alloc(0)
    this.phase = 'holding'
    this.deliveredThisConnection = true
    this.publishStatus(Status.Ok)
    logger.info(
      `TCP probe resolved, model=0x${result.model.toString(16)}, deviceType=${result.deviceType}`
    )
    try {
      this.onProbeResult?.(result)
    } catch (err) {
      logger.error(`onProbeResult callback threw: ${(err as Error).message ?? String(err)}`)
    }
  }

  private failProbeRound(): void {
    if (this.phase !== 'probe-wait') return
    this.awaitingModel = false
    this.pendingProbe = null
    this.clearTimer('probe')
    this.rx = Buffer.alloc(0)
    this.phase = 'retry-wait'
    this.publishStatus(Status.Connecting)
    if (this.socket?.isConnected) this.scheduleSameSocketRetry()
    else this.reconnect()
  }

  private scheduleSameSocketRetry(): void {
    if (this.probeClosed || this.retryTimer) return
    const generation = this.probeGeneration
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (generation !== this.probeGeneration || this.probeClosed || !this.socket?.isConnected) return
      this.fireProbe()
    }, this.retryDelayMs)
  }

  private handleSocketDown(): void {
    if (this.probeClosed) return
    if (this.deliveredThisConnection) {
      try {
        this.onLinkLost?.()
      } catch (err) {
        logger.error(`onLinkLost callback threw: ${(err as Error).message ?? String(err)}`)
      }
      return
    }
    this.reconnect()
  }

  private clearTimer(which: 'probe' | 'retry' | 'reconnect'): void {
    const timer = which === 'probe' ? this.probeTimer : which === 'retry' ? this.retryTimer : this.reconnectTimer
    if (!timer) return
    clearTimeout(timer)
    if (which === 'probe') this.probeTimer = null
    else if (which === 'retry') this.retryTimer = null
    else this.reconnectTimer = null
  }
}

export { Connection }
