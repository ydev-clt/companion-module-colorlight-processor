/**
 * SpSession — JSON ↔ device binary translation for the Colorlight
 * String-Protocol, now backed by the WASM build of libsp `sp_session`.
 *
 * Differences from the original `.node` implementation (affecting callers):
 *  1. `SpSession.create(proto, opts)` changed from synchronous → `Promise<SpSession>`.
 *     This is because WASM first instantiation is async (`WebAssembly.instantiate`).
 *     Business callers should `await` it; if session is taken directly in a
 *     synchronous path, the connection layer must wait at `bindSpSession()`.
 *  2. `SpIoResult.bin` is still `Buffer` (wrapping a `Buffer.from(...)` on the
 *     WASM output `ArrayBuffer`), fully consistent with the original `.node` behavior.
 *     `_extractErrorCode` parses the first `code > 0` in the JSON text.
 *  3. `inbound()` automatically adds the `<...>` frame to business JSON;
 *     `outbound()` directly consumes device binary → business JSON.
 *
 * Aspects that remain unchanged (maintaining 1:1 compatibility):
 *  - Values and semantics of ERR / isProtocolLayer / isLibraryError / isPartial
 *  - Instance methods (inbound / outbound / drop / destroy / takeFollowup) —
 *    still called synchronously (the `em` reference is captured at construction,
 *    no runtime await needed)
 *
 * Silent changes: Originally `SpSession.errorString` / `SpSession.nativeVersion`
 * were synchronous static methods, relying on the native addon loaded at process
 * startup. After WASM migration, these two static methods must first await
 * module loading and become `Promise<string>`; there are no callers in the current
 * project (the connection layer uses instance methods), so this upgrade is
 * zero-breaking.
 */

import { loadWasmModule, type EmscriptenModule, type SpSessionCApi } from './platform'

// ---------------------------------------------------------------------------
// 1. Constants and error semantics (aligned with lib/sp/sp_error.h sp_err_t)
// ---------------------------------------------------------------------------

export const PROTO_A = 1 as const
export const PROTO_B = 2 as const

export const ERR = Object.freeze({
  // Internal errors (returned only via C API, not in JSON "code")
  PARTIAL: 8001,
  BUF_TOO_SMALL: 8002,
  ENCODE_FAIL: 8003,
  DECODE_FAIL: 8004,
  CHECKSUM: 8005,
  UNKNOWN: 9999,

  // Protocol layer errors (also exposed via JSON "code")
  INVALID_JSON: 9001,
  NO_DELIMITER: 9002,
  NOT_ARRAY: 9003,
  EMPTY_ARRAY: 9004,
  NOT_OBJECT: 9005,
  DEVICE_NOT_FOUND: 9006,
  TIMEOUT: 9007,
  PARAM_INVALID: 9008,
  PARAM_MISSING: 9009,
  CMD_UNSUPPORTED: 9010,
  CAPABILITY: 9011
})

const PROTOCOL_LAYER_MIN = 9001
const PROTOCOL_LAYER_MAX = 9011
const LIBRARY_ERROR_MIN = 8002
const LIBRARY_ERROR_MAX = 8999

/** 9001..9011: Protocol layer errors, recoverable, same-value "code" in JSON. */
export function isProtocolLayer(err: number): boolean {
  return Number.isInteger(err) && err >= PROTOCOL_LAYER_MIN && err <= PROTOCOL_LAYER_MAX
}

/** 8002..8999: Internal library errors, should throw on JS side. */
export function isLibraryError(err: number): boolean {
  return Number.isInteger(err) && err >= LIBRARY_ERROR_MIN && err <= LIBRARY_ERROR_MAX
}

/** 8001: Multi-frame intermediate state, do not throw. */
export function isPartial(err: number): boolean {
  return err === ERR.PARTIAL
}

// ---------------------------------------------------------------------------
// 2. Public types
// ---------------------------------------------------------------------------

export interface SpSessionOptions {
  /** Whitelist of device-supported command short codes; empty/not passed = debug mode (allow all). Unknown short codes cause creation to fail. */
  devCmds?: string[]
  /** Inbound binary scratch capacity, default 64 KiB. */
  binCap?: number
  /** Inbound/outbound JSON scratch capacity, default 64 KiB. */
  jsonCap?: number
}

export interface SpIoResult {
  /** C-side sp_err_t; 0 = OK, see ERR. */
  err: number
  /** Device-side binary; present when err === 0 and binLen > 0. */
  bin?: Buffer | null
  /** Business-side JSON; present when jsonLen > 0. `<...>` frame already stripped, can be JSON.parse'd directly. */
  json?: string | null
}

export interface SpFollowupResult {
  err: number
  bin?: Buffer | null
}

// ---------------------------------------------------------------------------
// 3. Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_BIN_CAP = 64 * 1024
const DEFAULT_JSON_CAP = 64 * 1024

const FRAME_OPEN = 0x3c // '<'
const FRAME_CLOSE = 0x3e // '>'
const WHITESPACE = [0x20, 0x09, 0x0a, 0x0d]

function requireToken(t: number): void {
  if (!Number.isInteger(t) || t < 1 || t > Number.MAX_SAFE_INTEGER) {
    throw new RangeError('token must be a positive integer')
  }
}

function requireCap(v: number | undefined, name: string, fallback: number): number {
  if (v === undefined) return fallback
  if (!Number.isInteger(v) || v < 1) throw new RangeError(`opts.${name} must be a positive integer`)
  return v
}

/** Check if buf already has a `<...>` frame (ignoring leading/trailing whitespace). */
function isFramed(buf: Buffer): boolean {
  let i = 0
  let j = buf.length - 1
  while (i <= j && WHITESPACE.indexOf(buf[i]) !== -1) i++
  while (j > i && WHITESPACE.indexOf(buf[j]) !== -1) j--
  return j > i && buf[i] === FRAME_OPEN && buf[j] === FRAME_CLOSE
}

/**
 * Add `<...>` frame to business JSON (spec §6.1 "message-type `<>` rules"),
 * returns as-is if already framed.
 *
 * This is not optional beautification: input without a frame is treated as
 * raw bytes by the C layer, and the returned "binary" is actually the
 * original JSON's ASCII with err still at 0 — silently producing wrong frames.
 */
function wrapFrame(buf: Buffer): Buffer {
  if (isFramed(buf)) return buf
  const out = Buffer.allocUnsafe(buf.length + 2)
  out[0] = FRAME_OPEN
  // Buffer#copy accepts a Uint8Array target in @types/node. Cast through
  // unknown because @types/node@20 + es2022 lib makes the Buffer/Uint8Array
  // overlap subtle.
  buf.copy(out as unknown as Uint8Array, 1)
  out[out.length - 1] = FRAME_CLOSE
  return out
}

/** Strip the `<...>` frame so callers can JSON.parse directly. */
function unwrapFrame(text: string): string {
  const trimmed = text.trim()
  if (
    trimmed.length >= 2 &&
    trimmed.charCodeAt(0) === FRAME_OPEN &&
    trimmed.charCodeAt(trimmed.length - 1) === FRAME_CLOSE
  ) {
    return trimmed.slice(1, -1)
  }
  return text
}

/**
 * Copy out the WASM output ArrayBuffer to avoid keeping the view
 * `Buffer.from(ab, 0, len)` externally (the view holds the entire scratch).
 *
 * (The read buffer is from emlib.js#readBuffer which does `new ArrayBuffer(len)` +
 *  byte loop, already detached from WASM linear memory, so we wrap it once more
 *  with Uint8Array(view) → Buffer.from to copy for the external holder.)
 */
function copyOut(ab: ArrayBuffer): Buffer {
  return Buffer.from(new Uint8Array(ab))
}

/**
 * Extract the first non-zero `code` field from a business JSON string.
 *
 * Protocol payload looks like `'[{"id":1,"cmd":"bright","sid":1,"op":"set","code":0,"data":{...}}, ...]'`,
 * where element-level `code > 0` indicates request/response failure (sharing
 * the same encoding space as lib/sp sp_err_t).
 *
 * Parse failures, non-arrays, elements not being objects, or no non-zero code
 * all return 0 (maintaining "success" semantics).
 */
function _extractErrorCode(jsonStr: string): number {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return 0
  }
  if (!Array.isArray(parsed)) return 0
  for (const item of parsed) {
    if (item && typeof item === 'object') {
      const code = (item as Record<string, unknown>).code
      if (typeof code === 'number' && Number.isInteger(code) && code > 0) {
        return code
      }
    }
  }
  return 0
}

// ---------------------------------------------------------------------------
// 4. WASM struct marshalling helpers (mirrors upstream `emlib.js`)
// ---------------------------------------------------------------------------
//
// The C API takes structs by value (sp_in_t) and by pointer (sp_out_t*). On
// wasm32 these structs are flat, packed layouts:
//
//   sp_in_t  = { const unsigned char *data; size_t len; }          =  8 bytes
//   sp_out_t = { unsigned char *buf; size_t cap; size_t len; }     = 12 bytes
//
// (Both pointers and size_t are 4 bytes on wasm32.) emscripten's cwrap
// has no struct-by-value support, so we marshal by hand: allocate the
// struct on the WASM heap, write the fields via setValue, and on the
// return path read the out-fields back via getValue + readBuffer.

/** Allocate an sp_in_t {data, len} struct pointing at a copy of `bytes`.
 *  Returns the struct ptr; caller must free with freeInStruct(). */
function allocInStruct(em: EmscriptenModule, bytes: Uint8Array): number {
  const dataPtr = em._malloc(bytes.length)
  em.writeArrayToMemory(bytes, dataPtr)
  const structPtr = em._malloc(8)
  em.setValue(structPtr, dataPtr, 'i32') // data
  em.setValue(structPtr + 4, bytes.length, 'i32') // len
  return structPtr
}

interface SpOut {
  structPtr: number
  bufPtr: number
}

/** Allocate an sp_out_t {buf, cap, len=0} struct with a backing buffer of
 *  `cap` bytes. */
function allocOutStruct(em: EmscriptenModule, cap: number): SpOut {
  const bufPtr = em._malloc(cap)
  const structPtr = em._malloc(12)
  em.setValue(structPtr, bufPtr, 'i32')
  em.setValue(structPtr + 4, cap, 'i32')
  em.setValue(structPtr + 8, 0, 'i32')
  return { structPtr, bufPtr }
}

/** Read an sp_out_t struct: extract len at offset 8, copy `len` bytes from
 *  the buffer at offset 0, free both backing buffer and struct. Returns
 *  {len, buf: ArrayBuffer|null} (buf is null when len === 0). */
function readOutStruct(em: EmscriptenModule, structPtr: number): { len: number; buf: ArrayBuffer | null } {
  const len = em.getValue(structPtr + 8, 'i32')
  if (len === 0) {
    const bufPtr = em.getValue(structPtr, 'i32')
    if (bufPtr) em._free(bufPtr)
    em._free(structPtr)
    return { len: 0, buf: null }
  }
  const bufPtr = em.getValue(structPtr, 'i32')
  const out = new ArrayBuffer(len)
  const view = new Uint8Array(out)
  // Read byte-by-byte: emscripten's getValue('i8') reads a single byte
  // from linear memory. Using setValue/getValue with offsets mirrors
  // emlib.js#readBuffer.
  for (let i = 0; i < len; i++) view[i] = em.getValue(bufPtr + i, 'i8')
  em._free(bufPtr)
  em._free(structPtr)
  return { len, buf: out }
}

/** Free an sp_in_t struct: read data ptr at offset 0, free data + struct. */
function freeInStruct(em: EmscriptenModule, structPtr: number): void {
  const dataPtr = em.getValue(structPtr, 'i32')
  if (dataPtr) em._free(dataPtr)
  em._free(structPtr)
}

/** Read `len` bytes starting at `ptr` into a fresh ArrayBuffer. */
function readBuffer(em: EmscriptenModule, ptr: number, len: number): ArrayBuffer {
  const out = new ArrayBuffer(len)
  const view = new Uint8Array(out)
  for (let i = 0; i < len; i++) view[i] = em.getValue(ptr + i, 'i8')
  return out
}

// ---------------------------------------------------------------------------
// 5. Module-level API latch
// ---------------------------------------------------------------------------
//
// Mirrors the upstream `src/js/sp_session.js` pattern: `setEmModule(em)`
// populates a module-level `api` reference that the static
// `SpSession.errorString` / `SpSession.nativeVersion` read. Static class
// methods can't capture instance state, so without this latch they'd have
// to go async (which would break the upstream 1:1 sync contract and
// add a needless `await` to anyone reading the docs).

let _em: EmscriptenModule | null = null
let _api: SpSessionCApi | null = null

/** Internal helper. Populated by SpSession.create() after the WASM module
 *  finishes loading. Public consumers must call `SpSession.create()` first. */
export function _setModuleApi(em: EmscriptenModule): void {
  _em = em
  _api = em._spApi ?? null
}

function _requireApi(): SpSessionCApi {
  if (!_api) {
    throw new Error('SpSession WASM module not loaded — call `await SpSession.create(proto, opts)` first')
  }
  return _api
}

// ---------------------------------------------------------------------------
// 6. SpSession
// ---------------------------------------------------------------------------

export class SpSession {
  static readonly PROTO_A = PROTO_A
  static readonly PROTO_B = PROTO_B

  private readonly _handle: number
  private readonly _binCap: number
  private readonly _jsonCap: number
  private _destroyed = false

  private constructor(handle: number, binCap: number, jsonCap: number) {
    this._handle = handle
    this._binCap = binCap
    this._jsonCap = jsonCap
  }

  /**
   * Create SpSession asynchronously.
   *
   * First call synchronously triggers WASM module loading (`loadWasmModule()`),
   * subsequent calls share the same Module instance.
   *
   * @throws TypeError proto or devCmds format is wrong
   * @throws RangeError binCap/jsonCap/options.binCap are not positive integers
   * @throws Error when `SpSessionCreate` fails (devCmds contains unknown short codes)
   */
  static async create(proto: 1 | 2, options?: SpSessionOptions): Promise<SpSession> {
    if (proto !== PROTO_A && proto !== PROTO_B) {
      throw new TypeError('proto must be 1 (A) or 2 (B)')
    }
    const opts = options ?? {}
    const devCmds = opts.devCmds ?? []
    if (!Array.isArray(devCmds) || !devCmds.every((s) => typeof s === 'string')) {
      throw new TypeError('opts.devCmds must be an array of strings')
    }
    const binCap = requireCap(opts.binCap, 'binCap', DEFAULT_BIN_CAP)
    const jsonCap = requireCap(opts.jsonCap, 'jsonCap', DEFAULT_JSON_CAP)

    // 1) Ensure WASM module is loaded (first time will fs.readFile + instantiate)
    const em = await loadWasmModule()
    _setModuleApi(em)
    const api = em._spApi
    if (!api) {
      throw new Error('WASM module loaded but _spApi binding is missing')
    }

    // 2) Native side: 0 / positive handle = success; -1 or NaN = failure.
    const handle = api.sp_session_create(proto, devCmds)
    if (!Number.isInteger(handle) || handle < 1) {
      throw new Error(
        `SpSessionCreate failed for proto ${proto} (devCmds=${JSON.stringify(devCmds)}); ` +
          `every entry must be a command short code the native library knows`
      )
    }
    return new SpSession(handle, binCap, jsonCap)
  }

  /**
   * Translate ERR.* number to a readable message. Requires `SpSession.create()`
   * to have succeeded once, otherwise throws "WASM module not loaded". There are
   * currently no callers in the project; retained for signature consistency
   * with the upstream WASM package `SpSession.errorString` (debug / docs use).
   */
  static errorString(err: number): string {
    if (typeof err !== 'number') throw new TypeError('err must be a number')
    return _requireApi().sp_err_str(err)
  }

  /** libsp internal version number (same as above: not used in the project). */
  static nativeVersion(): string {
    return _requireApi().sp_version()
  }

  private _guard(): void {
    if (this._destroyed) throw new Error('session destroyed')
  }

  /** Get the current process's EmscriptenModule. Used only internally by SpSession instance methods. */
  private get em(): EmscriptenModule {
    // create() already ensures _em is non-null; defend again here
    if (!_em) throw new Error('SpSession has no loaded WASM module (internal bug)')
    return _em
  }

  private get api(): SpSessionCApi {
    return this.em._spApi ?? _requireApi()
  }

  /**
   * Business JSON → device binary (+ synthetic JSON).
   *
   * Pass bare payload as `json`; missing `<...>` frame will be added automatically.
   */
  inbound(token: number, json: string | Buffer): SpIoResult {
    this._guard()
    requireToken(token)
    const em = this.em
    const api = this.api

    // Normalize input to UTF-8 bytes regardless of string or Buffer.
    let inBuf: Buffer
    if (Buffer.isBuffer(json)) {
      inBuf = json
    } else if (typeof json === 'string') {
      inBuf = Buffer.from(json, 'utf8')
    } else {
      throw new TypeError('json must be a string or Buffer')
    }

    const framed = wrapFrame(inBuf)
    const u8 = new Uint8Array(framed.buffer, framed.byteOffset, framed.byteLength)
    const inStruct = allocInStruct(em, u8)
    const binOut = allocOutStruct(em, this._binCap)
    const jsonOut = allocOutStruct(em, this._jsonCap)
    try {
      const err = api.sp_session_inbound(this._handle, token, inStruct, binOut.structPtr, jsonOut.structPtr)
      const bin = readOutStruct(em, binOut.structPtr)
      const json = readOutStruct(em, jsonOut.structPtr)
      // binOut / jsonOut already released inside readOutStruct.
      return _wrapIoResult(err, bin.buf, json.buf, /* hasBin */ true)
    } finally {
      freeInStruct(em, inStruct)
    }
  }

  /**
   * Device binary → business JSON.
   *
   * The returned `json` has the `<...>` frame stripped, can be JSON.parse'd directly.
   */
  outbound(token: number, bin: Buffer): SpIoResult {
    this._guard()
    requireToken(token)
    if (!Buffer.isBuffer(bin)) throw new TypeError('bin must be a Buffer')
    const em = this.em
    const api = this.api

    const u8 = new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength)
    const inStruct = allocInStruct(em, u8)
    const jsonOut = allocOutStruct(em, this._jsonCap)
    try {
      const err = api.sp_session_outbound(this._handle, token, inStruct, jsonOut.structPtr)
      const json = readOutStruct(em, jsonOut.structPtr)
      // outbound does not write bin output — pass null.
      return _wrapIoResult(err, null, json.buf, /* hasBin */ false)
    } finally {
      freeInStruct(em, inStruct)
      // jsonOut released inside readOutStruct.
    }
  }

  /** Multi-stage GET follow-up frame; current business path does not write followup, usually returns { err: 0, bin: null }. */
  takeFollowup(token: number): SpFollowupResult {
    this._guard()
    requireToken(token)
    const em = this.em
    const api = this.api

    const binPtr = em._malloc(this._binCap)
    const respPtr = em._malloc(16)
    try {
      const err = api.sp_session_take_followup(this._handle, token, this._binCap, respPtr)
      const outLen = em.getValue(respPtr + 4, 'i32')
      if (err === 0 && outLen === 0) {
        return { err: 0, bin: null }
      }
      if (isLibraryError(err)) {
        throw new Error(SpSession.errorString(err))
      }
      const bin = outLen > 0 ? copyOut(readBuffer(em, binPtr, outLen)) : null
      return { err, bin }
    } finally {
      em._free(binPtr)
      em._free(respPtr)
    }
  }

  /** Release pending for a token. Must be called when connection is disconnected, otherwise the token slot remains occupied. */
  drop(token: number): void {
    this._guard()
    requireToken(token)
    this.api.sp_session_drop(this._handle, token)
  }

  /** Destroy session. The same instance can no longer be used. */
  destroy(): void {
    if (this._destroyed) return
    this.api.sp_session_destroy(this._handle)
    this._destroyed = true
  }
}

// ---------------------------------------------------------------------------
// 7. Result handling — translate raw err + ArrayBuffers into public shape
// ---------------------------------------------------------------------------

function _wrapIoResult(err: number, bin: ArrayBuffer | null, json: ArrayBuffer | null, hasBin: boolean): SpIoResult {
  if (err === 0) {
    const out: SpIoResult = { err: 0 }
    if (hasBin && bin) out.bin = copyOut(bin)
    if (json) {
      const jsonStr = unwrapFrame(Buffer.from(json).toString('utf8'))
      const code = _extractErrorCode(jsonStr)
      if (code > 0) out.err = code
      out.json = jsonStr
    }
    return out
  }
  if (isPartial(err)) {
    return { err: ERR.PARTIAL }
  }
  if (isProtocolLayer(err)) {
    const out: SpIoResult = { err }
    if (json) out.json = unwrapFrame(Buffer.from(json).toString('utf8'))
    return out
  }
  // Library errors and unknown codes are all thrown.
  throw new Error(SpSession.errorString(err))
}

// ---------------------------------------------------------------------------
// 8. Backward-compatible exports
// ---------------------------------------------------------------------------

// Old hello retained only for debugging. `.node` era's `hello.node` provided it;
// WASM has no corresponding export, so a readable placeholder is provided
// for import compatibility.
export const hello: (input: string) => string = (input: string) =>
  `hello() unavailable: WASM build does not export it (input=${JSON.stringify(input)})`

export default SpSession
