import type { OP } from './constants'

/**
 * Protocol base types (§4.2.4)
 *
 * Request objects must contain the id/cmd/sid/op tuple; data is optional.
 * Response objects carry code/data on top of the request.
 */

/** Raw transaction id (uint32, 0～4294967295, §2) */
export type TransactionId = number

/** Sender number sid (1～254 / 255 for broadcast, §4.2.5) */
export type SenderId = number

/** Screen group number gid (default 1, §2) */
export type GroupId = number

/** op field literal */
export type Op = (typeof OP)[keyof typeof OP]

/**
 * Request object (§4.2.4)
 */
export interface StringRequest<TData = unknown> {
  id: TransactionId
  cmd: string
  sid: SenderId
  op: Op
  data?: TData
}

/**
 * Response object (§4.2.4)
 */
export interface StringResponse<TData = unknown> {
  id: TransactionId
  cmd: string
  sid: SenderId
  op: Op
  code: number
  data?: TData
}
