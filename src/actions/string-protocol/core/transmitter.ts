import { PROTOCOL_CODE } from './constants'
import { logger } from '../../../log'
import { encodeRequest, TransactionIdAllocator } from './frames'
import type { StringRequest, StringResponse } from './types'
import { SpSession as SpSessionCtor } from '../../../str2bin'
import type { SpSession } from '../../../str2bin'

/**
 * SPTransmitter — String-Protocol transmit / receive + response routing layer
 *
 * Design goals:
 *  1. Share the UDPHelper from `src/connection.ts`
 *     (by injecting `send()` into SPTransmitter, which handles protocol
 *     semantics on its own)
 *  2. Response routing: when sending a request with a callback, register
 *     (id → callback) in `_handlers`; on receiving a response frame, match
 *     the callback by `id` and remove it; clean up on timeout
 *
 * Not implemented here:
 *  - Does not manage UDP directly — `src/connection.ts` provides `socket.send`
 *  - Does not re-implement Status reporting — still driven by Connection
 */

interface PendingRequest {
  resolve: (resp: StringResponse) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
  startedAt: number
}

interface SPTransmitterOptions {
  /** Custom response timeout (default 5s) */
  responseTimeoutMs?: number
}

/**
 * Inject the upper-layer send function + status update function.
 */
export interface SPTransmitterHost {
  /** Write binary Buffer converted by SpSession down to the device over UDP */
  send: (bin: Buffer) => Promise<boolean>
}

export class SPTransmitter {
  private _allocator: TransactionIdAllocator
  private _handlers: Map<number, PendingRequest> = new Map()
  private _options: Required<SPTransmitterOptions>

  private _host: SPTransmitterHost | null = null

  // SpSession bridge (injected by CltProcessor via bindSpSession when TCP is OK)
  private _spSession: SpSession | null = null
  private _token: number = 1
  // Proto used by the current SpSession (for logging only)
  private _spProto: 1 | 2 | null = null

  constructor(options: SPTransmitterOptions = {}) {
    this._allocator = new TransactionIdAllocator(1)
    this._options = {
      responseTimeoutMs: options.responseTimeoutMs ?? 5000
    }
  }

  /** Inject send/status interfaces */
  init(host: SPTransmitterHost): void {
    this._host = host
    logger.info('SPTransmitter initialized')
  }

  /**
   * Called by CltProcessor when the probe succeeds (UDP connection OK) to establish SpSession.
   *  - Multiple calls on the same SPTransmitter will release the old one first.
   *  - proto: PROTO_A=1 for A-Protocol, PROTO_B=2 for B-Protocol
   *
   * Note: async is because the underlying WASM module instantiation is async
   * (`WebAssembly.instantiate`). Callers must `await` this method, otherwise
   * a race condition causes other synchronous methods to throw "session destroyed".
   */
  public async bindSpSession(proto: 1 | 2): Promise<void> {
    // Release the old one first if called multiple times on the same SPTransmitter
    this.releaseSpSession()

    try {
      // Debug mode: do not pass devCmds, allow all commands through
      this._spSession = await SpSessionCtor.create(proto, {})
      this._spProto = proto
      logger.info(`SpSession bound: proto=${proto} token=${this._token}`)
    } catch (err) {
      logger.error(`SpSession.create failed: ${(err as Error).message ?? String(err)}`)
      this._spSession = null
      this._spProto = null
      throw err
    }
  }

  /**
   * Release SpSession.
   *  - Calls drop(token) + destroy()
   *  - Sets _spSession to null
   */
  public releaseSpSession(): void {
    const sess = this._spSession
    const proto = this._spProto
    if (!sess) return
    this._spSession = null
    this._spProto = null
    try {
      try {
        sess.drop(this._token)
      } catch (err) {
        logger.warn(`SpSession.drop error: ${(err as Error).message ?? String(err)}`)
      }
      sess.destroy()
    } catch (err) {
      logger.warn(`SpSession.destroy error: ${(err as Error).message ?? String(err)}`)
    }
    logger.info(`SpSession released: proto=${proto} token=${this._token}`)
  }

  /** Destroy (called when connection is disconnected / instance is destroyed) */
  destroy(): void {
    for (const [, pending] of this._handlers) {
      pending.reject(new Error('SPTransmitter destroyed'))
      clearTimeout(pending.timer)
    }
    this._handlers.clear()
    // Release SpSession (drop + destroy)
    this.releaseSpSession()
    this._host = null
    logger.info('SPTransmitter destroyed')
  }

  /**
   * Handle received downlink data (callback at Connection `socket.on('data', ...)`)
   *  - Restore Z/V binary back to String-Protocol JSON via SpSession.outbound
   *  - Parse JSON array and dispatch to _handleResponse
   *  - Library errors (8002-8999) are logged and discarded; protocol errors
   *    (9001-9011) go through the json branch
   */
  handleIncoming(data: Buffer): void {
    if (!this._spSession) {
      logger.warn('SPTransmitter.handleIncoming before bindSpSession(); dropping buffer')
      return
    }

    let result: ReturnType<SpSession['outbound']>
    try {
      result = this._spSession.outbound(this._token, data)
    } catch (err) {
      logger.error(`SpSession.outbound threw: ${(err as Error).message ?? String(err)}; dropping buffer`)
      return
    }

    if (result.err === 0) {
      if (result.json) {
        logger.debug(`SpSession.outbound JSON: ${result.json}`)
        this._dispatchJsonString(result.json)
      } else {
        // err=0 but json/bin are both missing: debug
        logger.debug('SpSession.outbound returned err=0 with no payload')
      }
      return
    }

    if (result.err === 8001) {
      // PARTIAL: wait for more bytes (SpSession has buffered internally), debug only
      logger.debug('SpSession.outbound PARTIAL: waiting for more bytes')
      return
    }

    if (result.err >= 8002 && result.err <= 8999) {
      // Library error: discard this buffer
      logger.error(`SpSession.outbound library error: err=${result.err}; dropping buffer`)
      return
    }

    if (result.err >= 9001 && result.err <= 9011) {
      // Protocol/parameter error: go through json branch (if SpSession returned json)
      if (result.json) {
        this._dispatchJsonString(result.json)
      } else {
        logger.warn(`SpSession.outbound protocol error with no json: err=${result.err}`)
      }
      return
    }

    logger.warn(`SpSession.outbound unexpected err: ${result.err}`)
  }

  /**
   * Parse the JSON string returned by SpSession (with <...> stripped),
   * dispatch item by item.
   * The json returned by SpSession.outbound is a raw JSON array string, e.g.:
   *   '[{"id":1,"cmd":"bright","sid":1,"op":"set","code":0,"data":{...}}]'
   */
  private _dispatchJsonString(json: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch (err) {
      logger.warn(`SpSession JSON.parse failed: ${(err as Error).message ?? String(err)}; json=${json.slice(0, 200)}`)
      return
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return
    }
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const r = item as Record<string, unknown>
      if (typeof r.cmd !== 'string' || typeof r.op !== 'string') continue
      const resp: StringResponse<unknown> = {
        id: Number(r.id ?? 0),
        cmd: r.cmd,
        sid: Number(r.sid ?? 0),
        op: r.op as StringResponse['op'],
        code: Number(r.code ?? 0),
        data: r.data ?? undefined
      }
      this._handleResponse(resp)
    }
  }

  /**
   * Convenience "send → await response" pattern commonly used in action callbacks:
   *   1) Allocate a transaction id
   *   2) Register handler
   *   3) Write to the device via host
   *   4) Wait for response or timeout reject
   *
   * Note: this method is a wrapped Promise. It must tolerate failures in
   * **action callbacks** (actions should not throw), so errors are logged as
   * warnings and undefined is returned.
   */
  async sendAndAwait<ReqData = unknown, ResData = unknown>(
    cmd: string,
    op: 'get' | 'set',
    sid: number,
    data?: ReqData
  ): Promise<StringResponse<ResData> | undefined> {
    if (!this._host) {
      logger.warn('SPTransmitter.sendAndAwait before init()')
      return undefined
    }

    const id = this._allocator.next()
    const request: StringRequest<ReqData> = {
      id,
      cmd,
      op,
      sid,
      data
    }

    // note: §5 The screen group field for each protocol is `data.gid`,
    // which the caller puts into data.

    try {
      const resp = await this._sendAndAwait(request as StringRequest, this._options.responseTimeoutMs)
      return resp as StringResponse<ResData>
    } catch (err) {
      logger.warn(`${cmd}#${id} (sid=${sid}, op=${op}) failed: ${(err as Error).message ?? String(err)}`)
      return undefined
    }
  }

  /**
   * Synchronous style: send only, no response waited (set-type main flow)
   *  - Converts JSON frame to Z/V binary via SpSession.inbound
   *  - Library errors (8002-8999) throw Error; protocol errors (9001-9011)
   *    are logged and not sent
   */
  async sendOnly<TData = unknown>(cmd: string, op: 'get' | 'set', sid: number, data?: TData): Promise<boolean> {
    if (!this._host) {
      logger.warn('SPTransmitter.sendOnly before init()')
      return false
    }
    if (!this._spSession) {
      logger.warn('SPTransmitter.sendOnly before bindSpSession()')
      return false
    }
    const id = this._allocator.next()
    const request: StringRequest<TData> = { id, cmd, op, sid, data }
    const frame = encodeRequest(request)
    logger.debug(`sendOnly req: ${JSON.stringify(request)}`)

    let bin: Buffer
    try {
      const enc = this._encodeFrame(frame)
      if (!enc.ok) {
        if (enc.code === 8001) {
          // PARTIAL: kept internally by SpSession, should not occur in inbound
          logger.warn(`StringProtocol inbound PARTIAL (unexpected): err=${enc.code}`)
        } else {
          // Protocol/parameter error: do not send
          logger.warn(`StringProtocol inbound protocol error: cmd=${cmd}#${id} code=${enc.code}`)
        }
        return false
      }
      if (!enc.bin) {
        logger.info(`StringProtocol send ${cmd}#${id} (sid=${sid}, op=${op}) -> no bin (silent ok)`)
        return true
      }
      bin = enc.bin
    } catch (err) {
      logger.warn(
        `StringProtocol send ${cmd}#${id} (sid=${sid}, op=${op}) failed: ${(err as Error).message ?? String(err)}`
      )
      return false
    }

    const ok = await this._host.send(bin)
    logger.info(`StringProtocol send ${cmd}#${id} (sid=${sid}, op=${op}) -> ${ok ? 'OK' : 'FAIL'}`)
    return ok
  }

  private async _sendAndAwait(req: StringRequest, timeoutMs: number): Promise<StringResponse> {
    logger.debug(`sendAndAwait req: ${JSON.stringify(req)}`)
    return new Promise<StringResponse>((resolve, reject) => {
      if (!this._host) {
        reject(new Error('SPTransmitter not initialized'))
        return
      }
      if (!this._spSession) {
        reject(new Error('SPTransmitter: SpSession not bound'))
        return
      }

      const timer = setTimeout(() => {
        this._handlers.delete(req.id)
        reject(new Error(`Timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      this._handlers.set(req.id, {
        resolve: (resp) => {
          clearTimeout(timer)
          resolve(resp)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
        timer,
        startedAt: Date.now()
      })

      const isSetOpt = req.op === 'set'
      let resJson: StringResponse
      let bin: Buffer
      try {
        const frame = encodeRequest(req)
        const enc = this._encodeFrame(frame)
        if (!enc.ok) {
          throw new Error(`SpSession.inbound protocol error: code=${enc.code}`)
        }
        if (enc.json) {
          resJson = (JSON.parse(enc.json) || [])[0]
        }
        if (!enc.bin) {
          // Silent ok but no bin: cancel handler
          throw new Error('SpSession.inbound returned no bin')
        }
        bin = enc.bin
      } catch (err) {
        this._handlers.delete(req.id)
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
        return
      }

      this._host
        .send(bin)
        .then((ok) => {
          if (!ok) {
            clearTimeout(timer)
            // UDP send failed: reject immediately to avoid waiting forever
            this._handlers.delete(req.id)
            reject(new Error('host send returned false'))
            return
          }
          if (isSetOpt) {
            clearTimeout(timer)
            this._handleResponse(resJson)
          }
        })
        .catch((err) => {
          clearTimeout(timer)
          this._handlers.delete(req.id)
          reject(err instanceof Error ? err : new Error(String(err)))
        })
    })
  }

  /**
   * Encode a JSON frame into device binary via SpSession.inbound.
   *
   * Shared by sendOnly and _sendAndAwait. Returns:
   *  - { ok: true, bin, json } — bin is null on a "silent ok" (nothing to
   *    send); json is the raw synthesized set-response string when present
   *  - { ok: false, code } — recoverable errors (protocol 9001-9011,
   *    partial 8001); callers log/handle per their own semantics
   *
   * Library errors (8002-8999 / unknown) throw.
   */
  private _encodeFrame(
    frame: string
  ): { ok: true; bin: Buffer | null; json: string | null } | { ok: false; code: number } {
    if (!this._spSession) {
      throw new Error('SPTransmitter: SpSession not bound')
    }
    const result = this._spSession.inbound(this._token, frame)
    logger.debug(`StringProtocol inbound: ${JSON.stringify(result)}`)

    if (result.err === 0) {
      return { ok: true, bin: result.bin ?? null, json: result.json ?? null }
    }
    if (result.err === 8001 || (result.err >= 9001 && result.err <= 9011)) {
      return { ok: false, code: result.err }
    }
    // Library error (8002-8999 / 9999): throw
    throw new Error(`SpSession.inbound library error: err=${result.err}`)
  }

  private _handleResponse(resp: StringResponse): void {
    // 1) Log response
    logger.info(`StringProtocol recv ${resp.cmd}#${resp.id} (sid=${resp.sid}, op=${resp.op}, code=${resp.code})`)

    // 2) Error code handling
    if (resp.code !== 0) {
      this._logProtocolCode(resp)
    }

    // 3) Match handler
    const pending = this._handlers.get(resp.id)
    if (pending) {
      this._handlers.delete(resp.id)
      pending.resolve(resp)
    }
  }

  private _logProtocolCode(resp: StringResponse): void {
    const msg = describeProtocolCode(resp.code)
    logger.warn(`${resp.cmd} returned code=${resp.code} (${msg}): ${JSON.stringify(resp.data ?? {})}`)
  }
}

/**
 * §Appendix C. Brief description of global error codes
 */
function describeProtocolCode(code: number): string {
  switch (code) {
    case PROTOCOL_CODE.SUCCESS:
      return 'success'
    case PROTOCOL_CODE.INVALID_JSON:
      return 'invalid JSON'
    case PROTOCOL_CODE.MISSING_DELIMITER:
      return 'missing < or > delimiter'
    case PROTOCOL_CODE.ROOT_NOT_ARRAY:
      return 'root is not array'
    case PROTOCOL_CODE.EMPTY_ARRAY:
      return 'empty root array'
    case PROTOCOL_CODE.ELEMENT_NOT_OBJECT:
      return 'array element is not object'
    case PROTOCOL_CODE.DEVICE_NOT_FOUND:
      return 'device not found'
    case PROTOCOL_CODE.TIMEOUT:
      return 'timeout'
    case PROTOCOL_CODE.INVALID_PARAMS:
      return 'invalid/overflow params'
    case PROTOCOL_CODE.MISSING_REQUIRED:
      return 'missing required fields'
    case PROTOCOL_CODE.CMD_UNSUPPORTED:
      return 'model does not support cmd'
    case PROTOCOL_CODE.PARAMS_OUT_OF_CAPABILITY:
      return 'params out of device capability'
    default:
      return 'unknown / other'
  }
}

export { describeProtocolCode }
