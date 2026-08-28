import { FRAME_LEFT_DELIMITER, FRAME_RIGHT_DELIMITER, TRANSACTION_ID_MAX } from './constants'
import type { StringRequest } from './types'

/**
 * Frame encoding utilities.
 *
 * Frame layout: `<` + UTF-8 JSON array + `>` (§4.2.1)
 *  - Each element of the array is a single request/response.
 *  - No unescaped raw `<` / `>` may appear inside the JSON.
 *  - The payload is emitted as a compact single line.
 *
 * Note: SpSession already handles TCP-layer framing (the `<...>` wrappers are
 * processed internally). This file no longer provides FrameBuffer /
 * decodeFrame. The String-Protocol action layer is only responsible for
 * encoding "request object -> JSON text".
 */

/**
 * Atomic transaction id allocator.
 *
 * Protocol requirement: ids must not repeat within a short interval on the
 * same link (§2). This implementation uses a circular uint32 from 1 to
 * TRANSACTION_ID_MAX, wrapping back to 1 on overflow.
 */
export class TransactionIdAllocator {
  private _next: number

  constructor(start = 1) {
    this._next = start > 0 && start <= TRANSACTION_ID_MAX ? start : 1
  }

  /** Get the next transaction id (practically never collides before wrapping back). */
  next(): number {
    const id = this._next
    this._next = this._next >= TRANSACTION_ID_MAX ? 1 : this._next + 1
    return id
  }

  /** Primarily for tests. */
  get current(): number {
    return this._next
  }
}

/**
 * Encode a request object into a protocol frame (`<...>`).
 *  - Throws when request fields are missing (id/cmd/sid/op are required, §4.2.4).
 *  - SpSession.inbound accepts either pre-wrapped `<...>` or bare JSON.
 */
export function encodeRequest<TData>(request: StringRequest<TData>): string {
  const payload = JSON.stringify([buildPlainRequest(request)])
  return `${FRAME_LEFT_DELIMITER}${payload}${FRAME_RIGHT_DELIMITER}`
}

/**
 * Build the plain request object (after stripping optional fields besides id).
 *  Centralized into a helper so that both encodeRequest and the builder share
 *  the same path, reducing protocol brittleness from key-order differences
 *  inside JSON.stringify.
 */
function buildPlainRequest<TData>(request: StringRequest<TData>): Record<string, unknown> {
  if (
    typeof request.id !== 'number' ||
    typeof request.cmd !== 'string' ||
    typeof request.sid !== 'number' ||
    typeof request.op !== 'string'
  ) {
    throw new Error('String-Protocol: request must include id/cmd/sid/op (§4.2.4)')
  }

  const plain: Record<string, unknown> = {
    id: request.id,
    cmd: request.cmd,
    sid: request.sid,
    op: request.op
  }
  if (request.data !== undefined && request.data !== null) {
    plain.data = request.data
  }

  return plain
}
