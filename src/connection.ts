import type { ConnectionContext } from './types'
import type { UDPHelper } from '@companion-module/base'
import { UDPHelper as UDPHelperCtor, InstanceStatus } from '@companion-module/base'
import { logger } from './log'
import {
  buildProbeRequest,
  buildSenderModelRequest,
  parseProbeResponse,
  parseSenderModelResponse,
  type ProbeResult
} from './udp-probe'

// UDP probe timeout (ms). A round fails when no valid reply arrives in this window.
const UDP_PROBE_TIMEOUT_MS = 1500

// Delay (ms) after a probe round ends (valid reply or failure) before the next
// round. Discovery retries a full probe; keepalive sends 0xEB only.
const UDP_PROBE_RETRY_DELAY_MS = 2000

/**
 * UDP transport + 0xEB/0xEA probe state machine.
 *
 * open() → discovery. A full probe is sent immediately (0xEB, plus a model
 * query when deviceType is 0). Success stores the identity, calls
 * onProbeResult(result), sets Ok, and enters keepalive.
 *
 * keepalive sends only 0xEB. A valid 0xEA sets Ok. onProbeResult(result) runs
 * only when the delivered identity changes. 1500ms with no valid 0xEA, or a
 * send failure, calls onProbeResult(null) once, clears the stored identity,
 * sets Connecting, and returns to discovery. The next round is a full probe
 * 2000ms after the round ends.
 *
 * discovery failure sets Connecting and retries a full probe after 2000ms.
 * It does not call onProbeResult.
 *
 * close() destroys the socket and clears timers, mode, and stored identity.
 * It does not call updateStatus or onProbeResult.
 */
class Connection {
  // connection context (used for handleIncoming + updateStatus)
  private context: ConnectionContext

  // underlying UDP socket
  private socket: UDPHelper | null = null

  // probe state machine
  private probeTimer: NodeJS.Timeout | null = null
  private probeRetryTimer: NodeJS.Timeout | null = null
  private probeInFlight: boolean = false
  private probeClosed: boolean = true
  // second probe stage (deviceType 0): sender-card model query awaiting its
  // 0xF1 reply. A non-null pendingProbe marks the stage as in flight.
  private modelQueryTimer: NodeJS.Timeout | null = null
  private pendingProbe: ProbeResult | null = null
  // last open() target — reused by the retry path
  private probeHost: string = ''
  private probePort: number = 0
  private onProbeResult: ((result: ProbeResult | null) => void) | null = null
  private probeMode: 'discovery' | 'keepalive' = 'discovery'
  private deliveredIdentity: { deviceType: 0 | 1 | 2; model: number } | null = null
  private publishedStatus: InstanceStatus | null = null

  constructor(context: ConnectionContext) {
    this.context = context
  }

  /**
   * Open a UDP socket to <host>:<port>, fire one 0xEB probe, and transition
   * to InstanceStatus.Connecting.
   *
   * Re-opening: destroys any existing socket and rejects any in-flight probe
   * with null before constructing the new one. A new probe fires immediately.
   */
  public open(host: string, port: number): void {
    // Always destroy the previous socket. A new open() invalidates the
    // previous probe's timer and callback.
    this.close()

    this.socket = new UDPHelperCtor(host, port, {})

    this.probeHost = host
    this.probePort = port
    this.probeClosed = false
    this._bindSocketEvents(this.socket)

    this._publishStatus(InstanceStatus.Connecting)
    logger.info(`UDP connection opening, host=${host}:${port}`)

    this._fireProbe(host, port)
  }

  /**
   * Destroy the UDPHelper, clear the probe timer, and resolve any in-flight
   * probe with null. Safe to call when already closed.
   *
   * Does not call updateStatus — InstanceBase handles teardown.
   */
  public close(): void {
    const hadSocket = this.socket !== null
    this.probeClosed = true
    this._clearProbeTimer()
    this._clearModelQueryTimer()
    this._clearProbeRetryTimer()
    this.probeInFlight = false
    this.pendingProbe = null
    this.probeMode = 'discovery'
    this.deliveredIdentity = null
    this.publishedStatus = null
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    if (hadSocket) logger.info('Connection closed (UDPHelper destroyed)')
  }

  /**
   * Send a business frame to the device. Returns false if the socket is
   * missing or the underlying UDP send rejects.
   */
  public async send(data: Buffer): Promise<boolean> {
    if (!this.socket) return false
    try {
      logger.debug(`UDP send:${data.toString('hex')}`)
      await this.socket.sendAsync(data)
      return true
    } catch (err) {
      logger.warn(`UDP send failed: ${(err as Error).message ?? String(err)}`)
      return false
    }
  }

  /**
   * Called on discovery success, on a keepalive identity change, and once
   * with null when keepalive fails. Not called on discovery failure.
   * One open() can invoke the callback more than once. close() never does.
   */
  public setOnProbeResult(cb: ((result: ProbeResult | null) => void) | null): void {
    this.onProbeResult = cb
  }

  private _publishStatus(status: InstanceStatus): void {
    if (this.publishedStatus === status) return
    this.publishedStatus = status
    try {
      this.context.updateStatus(status)
    } catch (err) {
      logger.error(`updateStatus threw: ${(err as Error).message ?? String(err)}`)
    }
  }

  // ============================================================
  // Probe state machine
  // ============================================================

  /**
   * Build a 0xEB request, send it on the current socket, and start a
   * 1500ms timer. Resolves via _finishProbe on the first valid 0xEA or
   * timer expiry. A deviceType-0 0xEA diverts into the model-query stage
   * (_startModelQuery) instead of resolving directly.
   */
  private _fireProbe(host: string, port: number): void {
    if (this.probeClosed || !this.socket) {
      return
    }
    if (this.probeInFlight) {
      logger.warn('UDPProbe: probe already in flight; resolving as null')
      this._finishProbe(null)
      return
    }
    this.probeInFlight = true
    this.pendingProbe = null

    const req = buildProbeRequest()
    logger.info(`UDPProbe: sending 0xEB to ${host}:${port}`)

    void this.socket.sendAsync(req).catch((err: Error) => {
      logger.warn(`UDPProbe send failed: ${err.message}`)
      this._finishProbe(null)
    })

    this.probeTimer = setTimeout(() => {
      logger.warn(`UDPProbe: timeout after ${UDP_PROBE_TIMEOUT_MS}ms (host=${host}:${port})`)
      this._finishProbe(null)
    }, UDP_PROBE_TIMEOUT_MS)
  }

  /**
   * Second probe stage, entered when the 0xEA deviceType byte is 0 (sender
   * card): sender cards do not carry the model in the 0xEA frame, so a
   * dedicated 17-byte query is sent and the model is read from the 0xF1
   * reply (offset 12).
   *
   * Re-arms the probe timer for this stage. Query failure (send error or
   * timeout) finishes the probe as failure; discovery stays active and does
   * not call onProbeResult.
   */
  private _startModelQuery(parsed: ProbeResult): void {
    // offset 23 of the 0xEA is meaningless for sender cards — zero it out
    // so the intermediate state never carries a bogus model
    this.pendingProbe = { ...parsed, model: 0 }
    this._clearProbeTimer()

    const req = buildSenderModelRequest()
    logger.info('UDPProbe: deviceType=0 (sender card); sending model query')

    void this.socket?.sendAsync(req).catch((err: Error) => {
      logger.warn(`UDPProbe: model query send failed: ${err.message}; continuing with model unknown`)
      this._finishModelQuery(undefined)
    })

    this.modelQueryTimer = setTimeout(() => {
      logger.warn(`UDPProbe: model query timeout after ${UDP_PROBE_TIMEOUT_MS}ms; continuing with model unknown`)
      this._finishModelQuery(undefined)
    }, UDP_PROBE_TIMEOUT_MS)
  }

  /**
   * Resolve the model-query stage with the given model byte and finish the
   * probe using the pending 0xEA result. No-op when no query is in flight
   * (already resolved / connection closed).
   */
  private _finishModelQuery(model?: number): void {
    if (!this.pendingProbe) return
    this._finishProbe(model === undefined ? null : { ...this.pendingProbe, model })
  }

  private _finishProbe(result: ProbeResult | null): void {
    if (!this.probeInFlight) return
    const mode = this.probeMode
    this.probeInFlight = false
    this._clearProbeTimer()
    this._clearModelQueryTimer()
    this.pendingProbe = null

    if (result) this._onProbeSuccess(mode, result)
    else this._onProbeFailure(mode)
  }

  private _onProbeSuccess(mode: 'discovery' | 'keepalive', result: ProbeResult): void {
    this._publishStatus(InstanceStatus.Ok)
    if (mode === 'discovery') {
      this.probeMode = 'keepalive'
      logger.info(
        `UDPProbe: discovery resolved, model=0x${result.model.toString(16)}, deviceType=${result.deviceType}; entering keepalive`
      )
      this._deliverIdentity(result)
    } else {
      const delivered = this._keepaliveDelivery(result)
      if (delivered) {
        logger.info(
          `UDPProbe: keepalive identity changed, model=0x${delivered.model.toString(16)}, deviceType=${delivered.deviceType}`
        )
        this._deliverIdentity(delivered)
      } else {
        logger.debug(`UDPProbe: keepalive ok, deviceType=${result.deviceType}`)
      }
    }
    this._scheduleNextRound()
  }

  private _onProbeFailure(mode: 'discovery' | 'keepalive'): void {
    this._publishStatus(InstanceStatus.Connecting)
    if (mode === 'keepalive') {
      this.probeMode = 'discovery'
      this.deliveredIdentity = null
      logger.warn(`UDPProbe: keepalive failed; returning to discovery (host=${this.probeHost}:${this.probePort})`)
      try {
        this.onProbeResult?.(null)
      } catch (err) {
        logger.error(`onProbeResult(null) callback threw: ${(err as Error).message ?? String(err)}`)
      }
    } else {
      logger.warn(`UDPProbe: discovery failed; retrying full probe (host=${this.probeHost}:${this.probePort})`)
    }
    this._scheduleNextRound()
  }

  private _keepaliveDelivery(result: ProbeResult): ProbeResult | null {
    const prev = this.deliveredIdentity
    if (result.deviceType === 0) {
      if (prev && prev.deviceType === 0) return null
      return { ...result, model: 0 }
    }
    if (prev && prev.deviceType === result.deviceType && prev.model === result.model) return null
    return result
  }

  private _deliverIdentity(result: ProbeResult): void {
    this.deliveredIdentity = { deviceType: result.deviceType, model: result.model }
    try {
      this.onProbeResult?.(result)
    } catch (err) {
      logger.error(`onProbeResult callback threw: ${(err as Error).message ?? String(err)}`)
    }
  }

  private _scheduleNextRound(): void {
    if (this.probeClosed) return
    if (this.probeRetryTimer) return
    this.probeRetryTimer = setTimeout(() => {
      this.probeRetryTimer = null
      if (this.probeClosed || !this.socket) return
      if (this.probeInFlight) {
        logger.warn('UDPProbe: skip scheduled probe; round already in flight')
        return
      }
      const kind = this.probeMode === 'keepalive' ? 'keepalive' : 'discovery'
      logger.debug(
        `UDPProbe: ${kind} round after ${UDP_PROBE_RETRY_DELAY_MS}ms (host=${this.probeHost}:${this.probePort})`
      )
      this._fireProbe(this.probeHost, this.probePort)
    }, UDP_PROBE_RETRY_DELAY_MS)
  }

  private _clearProbeTimer(): void {
    if (this.probeTimer) {
      clearTimeout(this.probeTimer)
      this.probeTimer = null
    }
  }

  private _clearModelQueryTimer(): void {
    if (this.modelQueryTimer) {
      clearTimeout(this.modelQueryTimer)
      this.modelQueryTimer = null
    }
  }

  private _clearProbeRetryTimer(): void {
    if (this.probeRetryTimer) {
      clearTimeout(this.probeRetryTimer)
      this.probeRetryTimer = null
    }
  }

  // ============================================================
  // Socket event binding
  // ============================================================

  /**
   * Attach the unified data/error/status_change handlers to a fresh
   * UDPHelper. data is routed by first byte: 0xEA → probe response,
   * anything else → business response (via context.handleIncoming).
   */
  private _bindSocketEvents(socket: UDPHelper): void {
    socket.on('data', (buf: Buffer) => {
      logger.info(`UDP receive buffer, length: ${buf.length}: ${buf.toString('hex')}`)
      this._dispatchIncoming(buf)
    })

    socket.on('error', (err: Error) => {
      logger.error(`UDP connection error: ${err.message}`)
    })

    socket.on('status_change', (status: InstanceStatus, _message: string | undefined) => {
      logger.info(`UDP connection status change, status: ${status}`)
      if (status === InstanceStatus.UnknownError) {
        this._publishStatus(InstanceStatus.UnknownError)
      }
    })
  }

  /**
   * Route an inbound packet to the probe state machine (0xEA, and 0xF1 while
   * the model query is in flight) or the String-Protocol business layer
   * (everything else).
   *
   * A malformed 0xEA (correct frame id but < 23 bytes, or any other reason
   * `parseProbeResponse` rejects) is dropped here, not forwarded to the
   * business layer. The String-Protocol parser would otherwise see a
   * non-S-Protocol start byte and either log a warn or throw — neither is
   * desired for what is plainly a malformed probe response. The same rule
   * applies to a malformed 0xF1 during the model-query stage; outside that
   * stage 0xF1 packets are business traffic and pass through untouched.
   */
  private _dispatchIncoming(buf: Buffer): void {
    // Defense: drop any inbound packets that arrive after close(). UDPHelper.destroy()
    // should stop the data stream, but the EventEmitter queue may still flush.
    if (this.probeClosed) return
    // A 0xEA first byte claims the probe frame id; parseProbeResponse
    // either returns a valid ProbeResult (≥23 bytes) or null. In the null
    // case we must drop the packet (spec: "0xEA but <23 B / wrong frame
    // id: dropped; keep waiting until timer") rather than let it leak
    // into the business layer.
    if (buf.length > 0 && buf[0] === 0xea) {
      if (this.pendingProbe) {
        logger.debug('UDPProbe: duplicate 0xEA during model query; ignoring')
        return
      }
      const parsed = parseProbeResponse(buf)
      if (!parsed) {
        logger.warn(`UDPProbe: dropping malformed 0xEA response (length=${buf.length}, expected ≥23)`)
        return
      }
      if (!this.probeInFlight) {
        this._handleUnsolicitedEa(parsed)
        return
      }
      if (this.probeMode === 'discovery' && parsed.deviceType === 0) {
        this._startModelQuery(parsed)
      } else {
        this._finishProbe(parsed)
      }
      return
    }
    // While the model query is in flight, an 0xF1 first byte claims the
    // model-query frame id: parse it (model = offset 12) and resolve the
    // probe. Malformed frames are dropped, not forwarded.
    if (this.pendingProbe && buf.length > 0 && buf[0] === 0xf1) {
      const model = parseSenderModelResponse(buf)
      if (model !== null) {
        logger.info(`UDPProbe: received 0xF1 model query response, model=0x${model.toString(16)}`)
        this._finishModelQuery(model)
      } else {
        logger.warn(`UDPProbe: dropping malformed 0xF1 response (length=${buf.length}, expected ≥13)`)
      }
      return
    }
    // Business response: hand to the String-Protocol layer.
    this.context.handleIncoming(buf)
  }

  private _handleUnsolicitedEa(parsed: ProbeResult): void {
    if (!this.probeRetryTimer) {
      logger.debug('UDPProbe: dropping 0xEA outside a probe round')
      return
    }
    if (this.probeMode === 'keepalive') {
      this._publishStatus(InstanceStatus.Ok)
      const delivered = this._keepaliveDelivery(parsed)
      if (delivered) {
        logger.info(
          `UDPProbe: keepalive identity changed from late 0xEA, model=0x${delivered.model.toString(16)}, deviceType=${delivered.deviceType}`
        )
        this._deliverIdentity(delivered)
      } else {
        logger.debug('UDPProbe: keepalive confirmed by late 0xEA')
      }
      return
    }
    this._clearProbeRetryTimer()
    this.probeInFlight = true
    if (parsed.deviceType === 0) {
      this._startModelQuery(parsed)
    } else {
      this._finishProbe(parsed)
    }
  }
}

export { Connection }
