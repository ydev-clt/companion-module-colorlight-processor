/**
 * Node-side WASM loader.
 *
 * Replaces the original `detectPlatform()`: previously had to use
 * `process.platform + process.arch` to assemble a name and load the
 * corresponding `win32_x64.node` native addon. After switching to WASM,
 * module loading logic is simply "read .wasm bytes → provide to emscripten
 * glue factory".
 *
 * Design points:
 *  - Only used in Node (`globalThis.document` does not exist). The wasm
 *    package's own `loader.js` uses `fetch + <script>` for browser paths;
 *    here we use `fs.readFileSync` to read .wasm, `createRequire` to load
 *    emscripten glue, both start once in this process.
 *  - Bypasses emscripten's `readBinary` (Node branch is undefined) via
 *    `Module.instantiateWasm`, with direct `WebAssembly.instantiate`.
 *  - Wraps the factory as `Promise<EmscriptenModule>` with singleton caching:
 *    multiple `SpSession.create()` calls share the same wasm module.
 *
 * Error semantics:
 *  - WASM byte load failure → Error contains original stack trace,
 *    traceable to ENOENT / EACCES thrown by `fs.readFileSync`;
 *  - Glue `require` failure → Error indicates missing `dist/sp_session.js`,
 *    suggesting `yarn install` and packaging config issues;
 *  - `WebAssembly.instantiate` failure → Error preserves original message
 *    + byte count line, for cross-reference with the original wasm package's
 *    loader.js.
 *
 * TypeScript note: The project tsconfig is `lib: ["es2022"]` (no DOM), so the
 * `WebAssembly` global namespace is not directly referenced here. Use
 * globalThis at runtime, with local aliases for types.
 */

import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { logger } from '../log'

/** Path/name constants — keep in sync with `build-config.cjs#extraFiles`. */
const WASM_GLUE_NAME = 'sp_session.js'
const WASM_BINARY_NAME = 'sp_session.wasm'

// project compiles to CommonJS, so __filename is available without changing
// tsconfig "module". Use dirname(__filename) instead of __dirname to avoid
// webpack statically inlining __dirname at build time (which would break the
// require lookup in the bundled output).
const crequire = createRequire(__filename)
const here = dirname(__filename)
const gluePath = resolve(here, WASM_GLUE_NAME)
const wasmPath = resolve(here, WASM_BINARY_NAME)

/** Read the .wasm binary eagerly. Throws on ENOENT/EACCES. */
const wasmBytes = readFileSync(wasmPath)

/** Discriminated error type so the call site can decide between `warn` vs `error`. */
export type WasmLoadErrorCode = 'ERR_WASM_BYTES' | 'ERR_WASM_GLUE' | 'ERR_WASM_INSTANTIATE'

interface WasmLoadError extends Error {
  code: WasmLoadErrorCode
}

/** Minimal subset of the emscripten Module interface that this loader touches. */
export interface EmscriptenModule {
  _spApi?: SpSessionCApi
  cwrap: (ident: string, returnType: string | null, argTypes: string[]) => (...args: unknown[]) => unknown
  _malloc: (size: number) => number
  _free: (ptr: number) => void
  setValue: (ptr: number, value: number, type: string) => void
  getValue: (ptr: number, type: string) => number
  UTF8ToString: (ptr: number) => string
  stringToUTF8: (str: string, ptr: number, maxBytesToWrite: number) => void
  lengthBytesUTF8: (str: string) => number
  writeArrayToMemory: (arr: Uint8Array, ptr: number) => void
}

/** Typed shape of the C API binding attached at `em._spApi`. */
export interface SpSessionCApi {
  sp_session_create(proto: number, devCmds: string[]): number
  sp_session_destroy(handle: number): void
  sp_session_inbound(handle: number, token: number, inStruct: number, binOut: number, jsonOut: number): number
  sp_session_outbound(handle: number, token: number, inStruct: number, outStruct: number): number
  sp_session_take_followup(handle: number, token: number, cap: number, respPtr: number): number
  sp_session_drop(handle: number, token: number): void
  sp_err_str(code: number): string
  sp_version(): string
  sp_str_cmd_parse(namePtr: number): number
}

/**
 * Minimal structural typing for the WebAssembly surface this loader uses.
 * Avoids pulling `lib.dom` into the project tsconfig just for one call.
 */
interface WasmImportsShape {
  [moduleName: string]: Record<string, unknown>
}
interface WasmInstanceShape {
  exports: Record<string, unknown>
}
interface WasmInstantiatedSourceShape {
  instance: WasmInstanceShape
}
interface WasmStatic {
  instantiate(bytes: Uint8Array, imports: WasmImportsShape): Promise<WasmInstantiatedSourceShape>
}

/** Cached fetched-once handle to globalThis.WebAssembly (Node 18/20+). */
function getWasm(): WasmStatic {
  // `as unknown` shields us from "Property 'WebAssembly' does not exist on
  // type 'typeof globalThis'" — Node typings expose WebAssembly only as a
  // type import, not a runtime value, so it isn't on `globalThis` directly.
  const g = globalThis as unknown as { WebAssembly: WasmStatic }
  return g.WebAssembly
}

let modulePromise: Promise<EmscriptenModule> | null = null

/**
 * Lazily load + instantiate the WASM module. Subsequent calls return the
 * same Promise — the underlying WASM instance is shared across all
 * `SpSession.create()` invocations.
 */
export function loadWasmModule(): Promise<EmscriptenModule> {
  if (modulePromise) return modulePromise
  modulePromise = doLoad().catch((err) => {
    // Reset so subsequent attempts can retry after a transient failure
    // (e.g. tmp file truncated, disk error mid-process).
    modulePromise = null
    throw err
  })
  return modulePromise
}

async function doLoad(): Promise<EmscriptenModule> {
  // 1) Load the emscripten glue. The original dist/sp_session.js is a UMD
  //    wrapper that exposes `module.exports = SpSessionModule` when
  //    required from CommonJS. The factory itself is the default export
  //    (or the module itself if no `default`).
  let factory: ((arg?: unknown) => Promise<EmscriptenModule>) | null = null
  try {
    const mod = crequire(gluePath) as
      | ((arg?: unknown) => Promise<EmscriptenModule>)
      | { default?: (arg?: unknown) => Promise<EmscriptenModule> }
    if (typeof mod === 'function') {
      factory = mod
    } else if (mod && typeof mod.default === 'function') {
      factory = mod.default
    }
  } catch (err) {
    const e = new Error(
      `Failed to load emscripten glue from ${gluePath}: ${(err as Error).message}. ` +
        `Check build-config.cjs#extraFiles includes "src/str2bin/wasm/".`
    ) as WasmLoadError
    e.code = 'ERR_WASM_GLUE'
    logger.error(e.message)
    throw e
  }

  if (typeof factory !== 'function') {
    const e = new Error(
      `Emscripten glue at ${gluePath} did not export a factory function. ` +
        `Did you rebuild @colorlight/sp-session-wasm?`
    ) as WasmLoadError
    e.code = 'ERR_WASM_GLUE'
    logger.error(e.message)
    throw e
  }

  // 2) Provide both `wasmBinary` (for any fallback code paths inside
  //    emscripten that read it) and `instantiateWasm` (which short-circuits
  //    emscripten's own file/network loader entirely — Node's branch does
  //    not define `readBinary`, so without this the factory would throw
  //    "both async and sync fetching of the wasm failed").
  const WA = getWasm()

  let em: EmscriptenModule
  try {
    em = await factory({
      wasmBinary: wasmBytes,
      instantiateWasm: (imports: WasmImportsShape, success: (instance: WasmInstanceShape) => void): void => {
        WA.instantiate(new Uint8Array(wasmBytes.buffer, wasmBytes.byteOffset, wasmBytes.byteLength), imports)
          .then((result) => success(result.instance))
          .catch((err: Error) => {
            throw new Error(`WebAssembly.instantiate failed: ${err.message ?? String(err)}`)
          })
      }
    })
  } catch (err) {
    const e = new Error(
      `Failed to instantiate WASM (${wasmBytes.byteLength} bytes from ${wasmPath}): ` +
        `${(err as Error).message ?? String(err)}`
    ) as WasmLoadError
    e.code = 'ERR_WASM_INSTANTIATE'
    logger.error(e.message)
    throw e
  }

  // Eagerly resolve the typed C API so the synchronous `SpSession` methods
  // (inbound/outbound/drop/destroy) can call `em._spApi.*` without await.
  bindCApi(em)
  logger.info(`WASM module loaded (${wasmBytes.byteLength} bytes) from ${wasmPath}`)
  return em
}

/**
 * Bind the 10 exports of sp_session.* + 2 alloc helpers to a typed JS API
 * on the Module. Mirrors `cwrapApi()` in the upstream WASM package's
 * `src/js/emlib.js`. The shape here is a structural subset — `SpSession`
 * only touches these methods.
 */
function bindCApi(em: EmscriptenModule): void {
  // The `api` is a closure so that `sp_session_create` can call
  // `sp_str_cmd_parse` while constructing the devCmds array.
  const api: SpSessionCApi = {
    sp_session_create(proto: number, devCmds: string[]): number {
      // devCmds is string[]; the C side expects sp_str_cmd_t[] enum values,
      // so each name is parsed via sp_str_cmd_parse first.
      const cmdEnums: number[] = []
      for (const name of devCmds) {
        const len = em.lengthBytesUTF8(name) + 1
        const ptr = em._malloc(len)
        em.stringToUTF8(name, ptr, len)
        const enumVal = api.sp_str_cmd_parse(ptr)
        em._free(ptr)
        if (enumVal < 0) {
          throw new Error(`unsupported command: ${name}`)
        }
        cmdEnums.push(enumVal)
      }
      const fn = em.cwrap('sp_session_create', 'number', ['number', 'array', 'number'])
      return fn(proto, cmdEnums, cmdEnums.length) as number
    },
    sp_session_destroy(handle: number): void {
      const fn = em.cwrap('sp_session_destroy', null, ['number'])
      fn(handle)
    },
    sp_session_inbound(handle: number, token: number, inStruct: number, binOut: number, jsonOut: number): number {
      const fn = em.cwrap('sp_session_inbound', 'number', ['number', 'number', 'number', 'number', 'number'])
      return fn(handle, token, inStruct, binOut, jsonOut) as number
    },
    sp_session_outbound(handle: number, token: number, inStruct: number, outStruct: number): number {
      const fn = em.cwrap('sp_session_outbound', 'number', ['number', 'number', 'number', 'number'])
      return fn(handle, token, inStruct, outStruct) as number
    },
    sp_session_take_followup(handle: number, token: number, cap: number, respPtr: number): number {
      const fn = em.cwrap('sp_session_take_followup', 'number', ['number', 'number', 'number', 'number'])
      return fn(handle, token, cap, respPtr) as number
    },
    sp_session_drop(handle: number, token: number): void {
      const fn = em.cwrap('sp_session_drop', null, ['number', 'number'])
      fn(handle, token)
    },
    sp_err_str(code: number): string {
      const fn = em.cwrap('sp_err_str', 'string', ['number'])
      return fn(code) as string
    },
    sp_version(): string {
      const fn = em.cwrap('sp_version', 'string', [])
      return fn() as string
    },
    sp_str_cmd_parse(namePtr: number): number {
      // C signature:
      //   sp_err_t sp_str_cmd_parse(const char *name, sp_str_cmd_t *cmd_out)
      // — wrap the 2-arg form via a heap-allocated out buffer; translate
      // SP_OK vs SP_ERR_* into the enum value or -1.
      const fn = em.cwrap('sp_str_cmd_parse', 'number', ['number', 'number'])
      const outPtr = em._malloc(4)
      try {
        const rc = fn(namePtr, outPtr) as number
        if (rc !== 0) return -1
        return em.getValue(outPtr, 'i32')
      } finally {
        em._free(outPtr)
      }
    }
  }
  em._spApi = api
}
