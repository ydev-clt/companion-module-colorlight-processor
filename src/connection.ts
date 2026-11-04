import type { ConnectionContext } from './common/types'
import type { InstanceStatus } from '@companion-module/base'
import { TCPHelper as TCPHelperCtor, InstanceStatus as Status } from '@companion-module/base'
import { logger } from './common/log'
import { UdpProbe, type ProbeResult, type UdpProbeSocket } from './udp-probe'

const DEFAULT_PROBE_TIMEOUT_MS = 1500
const DEFAULT_RETRY_DELAY_MS = 2000

export interface TcpSocket {
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
  udpSocketFactory?: (host: string, port: number) => UdpProbeSocket
  tcpSocketFactory?: (host: string, port: number) => TcpSocket
  probeTimeoutMs?: number
  retryDelayMs?: number
}

type Phase = 'closed' | 'discovering' | 'tcp-connecting' | 'holding' | 'business'

/**
 * UDP discovery on port 9099, then a TCP session for commands.
 * TCPHelper auto-reconnect stays off. A later reconnect starts at UDP discovery again.
 *
 * Phases:
 *  - closed: no session
 *  - discovering: waiting for a probe result
 *  - tcp-connecting: probe succeeded, TCP handshake in progress
 *  - holding: TCP is up, but inbound bytes are ignored until SpSession is bound
 *  - business: commands and device push may flow
 *
 * `generation` drops TCP callbacks from a session that close() already replaced.
 * The reconnect timer is cleared directly in close().
 * `delivered` is set when TCP connects. A drop before that restarts discovery.
 * A drop after that tells the module once and lets it own the reconnect.
 */
class Connection {
  private context: ConnectionContext
  private tcp: TcpSocket | null = null
  private readonly tcpSocketFactory: (host: string, port: number) => TcpSocket
  private readonly udpProbe: UdpProbe
  private readonly retryDelayMs: number

  private reconnectTimer: NodeJS.Timeout | null = null
  /** Bumps on close so TCP callbacks from the previous session are ignored. */
  private generation = 0
  private closed = true
  private host = ''
  private tcpPort = 0
  private onProbeResult: ((result: ProbeResult | null) => void) | null = null
  private onLinkLost: (() => void) | null = null
  /** True once TCP has connected, before the probe callback runs. */
  private delivered = false
  /** Link-loss callback fires once per delivered session. */
  private linkLossNotified = false
  /** Probe payload held until TCP connects, then passed to the module. */
  private pendingResult: ProbeResult | null = null
  private phase: Phase = 'closed'
  private publishedStatus: Status | null = null

  constructor(context: ConnectionContext, options: ConnectionOptions = {}) {
    this.context = context
    this.tcpSocketFactory =
      options.tcpSocketFactory ?? ((host, port) => new TCPHelperCtor(host, port, { reconnect: false }) as TcpSocket)
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    this.udpProbe = new UdpProbe({
      socketFactory: options.udpSocketFactory,
      probeTimeoutMs: options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
      retryDelayMs: this.retryDelayMs
    })
    this.udpProbe.setOnResult((result) => this.onUdpResult(result))
  }

  /** Replace any current session and start UDP discovery. TCP opens only after a probe result. */
  public open(host: string, port: number): void {
    this.close()
    this.host = host
    this.tcpPort = port
    this.closed = false
    this.phase = 'discovering'
    this.publishStatus(Status.Connecting)
    logger.info(`Discovery opening, host=${host}, udp=9099, tcp=${port}`)
    this.udpProbe.start(host)
  }

  public close(): void {
    this.generation++
    const noisy = this.tcp !== null || this.phase !== 'closed'
    this.closed = true
    this.delivered = false
    this.linkLossNotified = false
    this.pendingResult = null
    this.phase = 'closed'
    this.publishedStatus = null
    this.clearReconnectTimer()
    this.udpProbe.stop()
    if (this.tcp) {
      this.tcp.destroy()
      this.tcp = null
    }
    if (noisy) logger.info('Connection closed')
  }

  /** Tear the session down and start discovery again after retryDelayMs. A second call while the timer is pending is ignored. */
  public reconnect(): void {
    if (this.reconnectTimer) return
    const host = this.host
    const port = this.tcpPort
    this.close()
    this.publishStatus(Status.Connecting)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!host) return
      this.open(host, port)
    }, this.retryDelayMs)
  }

  /**
   * Open the receive path. Called only after SpSession is bound, so bytes that
   * arrive during discovery or connect are not parsed.
   */
  public beginReceiving(): void {
    if (this.phase !== 'holding') return
    this.phase = 'business'
    logger.info('TCP business receive started')
  }

  public async send(data: Buffer): Promise<boolean> {
    // Every frame waits until the module has bound SpSession and called beginReceiving().
    if (!this.tcp || !this.tcp.isConnected || this.phase !== 'business') return false
    try {
      logger.debug(`TCP send:${data.toString('hex')}`)
      return (await this.tcp.sendAsync(data)) === true
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

  private onUdpResult(result: ProbeResult): void {
    if (this.closed || this.phase !== 'discovering') return
    this.pendingResult = result
    this.phase = 'tcp-connecting'
    const generation = this.generation
    this.tcp = this.tcpSocketFactory(this.host, this.tcpPort)
    this.bindTcp(this.tcp, generation)
    logger.info(`TCP connection opening, host=${this.host}:${this.tcpPort}`)
  }

  /**
   * TCP is up. Publish OK, then hand the probe result to the module.
   * The module binds SpSession and calls beginReceiving(); until then inbound data is dropped.
   */
  private onTcpConnect(): void {
    if (this.phase !== 'tcp-connecting' || !this.pendingResult) return
    const result = this.pendingResult
    this.pendingResult = null
    this.phase = 'holding'
    this.delivered = true
    this.publishStatus(Status.Ok)
    const generation = this.generation
    if (generation !== this.generation || this.closed) return
    try {
      this.onProbeResult?.(result)
    } catch (err) {
      logger.error(`onProbeResult callback threw: ${(err as Error).message ?? String(err)}`)
    }
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

  private bindTcp(socket: TcpSocket, generation: number): void {
    const current = (): boolean => generation === this.generation && !this.closed
    socket.on('connect', () => {
      if (!current()) return
      logger.info(`TCP connected, host=${this.host}:${this.tcpPort}`)
      this.onTcpConnect()
    })
    socket.on('data', (buf: Buffer) => {
      logger.debug(`TCP received data: ${buf.toString('hex')}`)
      if (!current()) return
      // Drop bytes until beginReceiving(). SpSession does not exist yet in
      // the connecting and holding phases.
      if (this.phase !== 'business') return
      this.context.handleIncoming(buf)
    })
    socket.on('error', (err: Error) => {
      if (!current()) return
      logger.error(`TCP connection error: ${err.message}`)
      this.handleTcpDown()
    })
    socket.on('end', () => {
      if (!current()) return
      logger.warn(`TCP connection ended, host=${this.host}:${this.tcpPort}`)
      this.handleTcpDown()
    })
    socket.on('status_change', (status: InstanceStatus) => {
      if (!current()) return
      if (status === Status.UnknownError || status === Status.Disconnected) this.handleTcpDown()
    })
  }

  /**
   * A TCP failure before the socket connects restarts discovery.
   * After connect, notify the module once and let it own the reconnect, so
   * two timers cannot race. This includes a drop after TCP connects and before
   * the probe callback runs.
   */
  private handleTcpDown(): void {
    if (this.closed) return
    if (this.delivered) {
      if (this.linkLossNotified) return
      this.linkLossNotified = true
      try {
        this.onLinkLost?.()
      } catch (err) {
        logger.error(`onLinkLost callback threw: ${(err as Error).message ?? String(err)}`)
      }
      return
    }
    this.pendingResult = null
    this.reconnect()
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }
}

export { Connection }
