import type { ConnectionContext } from './types'
import type { InstanceStatus } from '@companion-module/base'
import { TCPHelper as TCPHelperCtor, InstanceStatus as Status } from '@companion-module/base'
import { logger } from './log'
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
 */
class Connection {
  private context: ConnectionContext
  private tcp: TcpSocket | null = null
  private readonly tcpSocketFactory: (host: string, port: number) => TcpSocket
  private readonly udpProbe: UdpProbe
  private readonly retryDelayMs: number

  private reconnectTimer: NodeJS.Timeout | null = null
  private generation = 0
  private closed = true
  private host = ''
  private tcpPort = 0
  private onProbeResult: ((result: ProbeResult | null) => void) | null = null
  private onLinkLost: (() => void) | null = null
  private delivered = false
  private linkLossNotified = false
  private pendingResult: ProbeResult | null = null
  private phase: Phase = 'closed'
  private publishedStatus: Status | null = null

  constructor(context: ConnectionContext, options: ConnectionOptions = {}) {
    this.context = context
    this.tcpSocketFactory =
      options.tcpSocketFactory ??
      ((host, port) => new TCPHelperCtor(host, port, { reconnect: false }) as TcpSocket)
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    this.udpProbe = new UdpProbe({
      socketFactory: options.udpSocketFactory,
      probeTimeoutMs: options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
      retryDelayMs: this.retryDelayMs
    })
    this.udpProbe.setOnResult((result) => this.onUdpResult(result))
  }

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

  public beginReceiving(): void {
    if (this.phase !== 'holding') return
    this.phase = 'business'
    logger.info('TCP business receive started')
  }

  public async send(data: Buffer): Promise<boolean> {
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

  private onTcpConnect(): void {
    if (this.phase !== 'tcp-connecting' || !this.pendingResult) return
    const result = this.pendingResult
    this.pendingResult = null
    this.phase = 'holding'
    this.delivered = true
    this.publishStatus(Status.Ok)
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
      if (!current()) return
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
