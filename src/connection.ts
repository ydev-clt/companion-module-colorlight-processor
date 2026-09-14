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

// UDP probe timeout (ms). Matches the previous UDPProbe default.
const UDP_PROBE_TIMEOUT_MS = 1500

// Delay (ms) before retrying a failed probe (timeout / send failure).
// A second probe keeps the connection in `Connecting` until the device
// comes online — the user-configured host may be temporarily unreachable.
const UDP_PROBE_RETRY_DELAY_MS = 2000

/**
 * UDP transport + embedded 0xEB/0xEA probe state machine.
 *
 * Lifecycle:
 *   new Connection(ctx) → IDLE
 *     open(host, port) → SENDING (constructs UDPHelper, sends 0xEB, starts
 *                        1500ms timer, updateStatus(Connecting))
 *       valid 0xEA, deviceType 1/2 → setOnProbeResult callback fires
 *                        (model = 0xEA offset 23); updateStatus(Ok)
 *       valid 0xEA, deviceType 0 → MODEL_QUERY: sends the 17-byte sender-card
 *                        model query, restarts the 1500ms timer; valid 0xF1
 *                        reply → callback fires (model = 0xF1 offset 12);
 *                        updateStatus(Ok). A model query that times out or
 *                        fails to send still succeeds with model=0 — the 0xEA
 *                        already proved the device is alive.
 *       timer fires (0xEB stage) → setOnProbeResult callback fires with null;
 *                    status unchanged; schedules a retry 2000ms later
 *                    (until close() or success)
 *     send(bin)   → writes to UDPHelper; returns false if socket missing/closed
 *     close()     → destroys UDPHelper, rejects in-flight probe as null,
 *                    cancels any pending retry
 *
 * Status is updated only on:
 *   - open() → Connecting
 *   - first valid 0xEA → Ok
 *   - UDPHelper.status_change === UnknownError → UnknownError
 * No other code path calls updateStatus.
 *
 * Heartbeat: removed. There is no periodic 1.5s V/Z send.
 *
 * Retry: a probe that times out (or fails to send) does not terminate the
 *   state machine — _finishProbe(null) schedules _fireProbe again after
 *   UDP_PROBE_RETRY_DELAY_MS, so a device that powers up later is detected
 *   without re-opening the connection.
 *
 * Concurrency: _probeInFlight mutex prevents reentrant _fireProbe calls.
 *   A second call while one is in flight logs a warn and resolves null.
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

    this.context.updateStatus(InstanceStatus.Connecting)
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
      await this.socket.send(data)
      return true
    } catch (err) {
      logger.warn(`UDP send failed: ${(err as Error).message ?? String(err)}`)
      return false
    }
  }

  /**
   * Register a one-shot callback fired when the probe resolves (success or
   * null/timeout). Re-registration invalidates any previous callback.
   *
   * The callback fires at most once per open(); a subsequent open() will
   * re-arm the probe and may fire the callback again.
   */
  public setOnProbeResult(cb: ((result: ProbeResult | null) => void) | null): void {
    this.onProbeResult = cb
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

    this.socket.send(req).catch((err: Error) => {
      logger.error(`UDPProbe send failed: ${err.message}`)
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
   * Re-arms the probe timer for this stage. Any stage failure (send error,
   * timeout) does NOT fail the probe: `_finishModelQuery(0)` resolves it
   * with an unknown model, because the 0xEA already confirmed the device —
   * failing here would loop the retry forever over a cosmetic model byte.
   */
  private _startModelQuery(parsed: ProbeResult): void {
    // offset 23 of the 0xEA is meaningless for sender cards — zero it out
    // so the intermediate state never carries a bogus model
    this.pendingProbe = { ...parsed, model: 0 }
    this._clearProbeTimer()

    const req = buildSenderModelRequest()
    logger.info('UDPProbe: deviceType=0 (sender card); sending model query')

    this.socket?.send(req).catch((err: Error) => {
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
    const pending = this.pendingProbe
    this._finishProbe(model === undefined ? null : { ...pending, model })
  }

  /**
   * Resolve the in-flight probe. Clears both stage timers and the pending
   * model query, drops the mutex, fires the registered callback, and (on
   * success) flips status to Ok.
   *
   * On null result (timeout / send failure / re-entry), no updateStatus
   * call is made — status remains where it was.
   */
  private _finishProbe(result: ProbeResult | null): void {
    if (!this.probeInFlight) return
    this.probeInFlight = false
    this._clearProbeTimer()
    this._clearModelQueryTimer()
    this.pendingProbe = null

    const cb = this.onProbeResult
    if (result) {
      logger.info(`UDPProbe: probe resolved, model=0x${result.model?.toString(16)}, deviceType=${result.deviceType}`)
      try {
        this.context.updateStatus(InstanceStatus.Ok)
      } catch (err) {
        logger.error(`updateStatus(Ok) threw: ${(err as Error).message ?? String(err)}`)
      }
      try {
        cb?.(result)
      } catch (err) {
        logger.error(`onProbeResult callback threw: ${(err as Error).message ?? String(err)}`)
      }
      logger.info('UDP connection ready (probe Ok)')
    } else {
      try {
        cb?.(null)
      } catch (err) {
        logger.error(`onProbeResult(null) callback threw: ${(err as Error).message ?? String(err)}`)
      }
      // Probe failed (timeout / send error / re-entry). Keep the connection
      // alive and retry after a short delay — the user-configured host may
      // come online later. close() cancels the pending retry.
      this._scheduleProbeRetry()
    }
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

  /**
   * Schedule a fresh _fireProbe after UDP_PROBE_RETRY_DELAY_MS, using the
   * host/port captured by the last open(). No-op once the connection is
   * closed or a retry is already pending.
   */
  private _scheduleProbeRetry(): void {
    if (this.probeClosed) return
    if (this.probeRetryTimer) return
    this.probeRetryTimer = setTimeout(() => {
      this.probeRetryTimer = null
      if (this.probeClosed || !this.socket) return
      logger.info(`UDPProbe: retrying after ${UDP_PROBE_RETRY_DELAY_MS}ms (host=${this.probeHost}:${this.probePort})`)
      this._fireProbe(this.probeHost, this.probePort)
    }, UDP_PROBE_RETRY_DELAY_MS)
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
        try {
          this.context.updateStatus(InstanceStatus.UnknownError)
        } catch (err) {
          logger.error(`updateStatus(UnknownError) threw: ${(err as Error).message ?? String(err)}`)
        }
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
        // duplicate 0xEA while the model query is in flight — the probe has
        // already moved past stage 1, ignore it
        logger.debug('UDPProbe: duplicate 0xEA during model query; ignoring')
        return
      }
      const parsed = parseProbeResponse(buf)
      if (parsed) {
        if (parsed.deviceType === 0) {
          // Sender card: model is not in the 0xEA frame — query it (0xF1).
          this._startModelQuery(parsed)
        } else {
          this._finishProbe(parsed)
        }
      } else {
        logger.warn(`UDPProbe: dropping malformed 0xEA response (length=${buf.length}, expected ≥23)`)
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
}

export { Connection }
