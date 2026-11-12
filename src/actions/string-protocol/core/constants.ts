/**
 * String-Protocol constants.
 *
 * Includes:
 *  - Frame delimiters (§4.2.1)
 *  - Device addressing conventions (§4.2.5 sid / §2 gid)
 *  - Global protocol error codes (§Appendix C)
 *  - Full command short-code set (§4.3 + §5)
 *  - Recommended heartbeat parameters (§5.1)
 */

/**
 * Frame delimiters.
 *  The JSON payload must be enclosed by `<` and `>` (§4.2.1).
 */
export const FRAME_LEFT_DELIMITER = '<' as const
export const FRAME_RIGHT_DELIMITER = '>' as const

/**
 * SID value conventions.
 *  - 1-254: a single sender id (§4.2.5)
 *  - 255: broadcast (only valid for devices that support USB cascading)
 */
export const SID_MIN = 1
export const SID_MAX_UNICAST = 254
export const SID_BROADCAST = 255

/**
 * GID value conventions.
 *  - Default 1; fill with the actual value for multi-screen-group setups (§2).
 */
export const GID_DEFAULT = 1

/**
 * Protocol-supported op values (§4.2.4).
 */
export const OP = {
  GET: 'get',
  SET: 'set',
  PUSH: 'push'
} as const

/**
 * Global protocol error codes (§Appendix C).
 */
export const PROTOCOL_CODE = {
  /** Success */
  SUCCESS: 0,
  /** Invalid JSON format */
  INVALID_JSON: 9001,
  /** Missing frame delimiters */
  MISSING_DELIMITER: 9002,
  /** Root element is not an array */
  ROOT_NOT_ARRAY: 9003,
  /** Array is empty */
  EMPTY_ARRAY: 9004,
  /** Array element is not an object */
  ELEMENT_NOT_OBJECT: 9005,
  /** Device not found */
  DEVICE_NOT_FOUND: 9006,
  /** Timeout */
  TIMEOUT: 9007,
  /** Invalid parameter */
  INVALID_PARAMS: 9008,
  /** Missing required parameter */
  MISSING_REQUIRED: 9009,
  /** Command not supported */
  CMD_UNSUPPORTED: 9010,
  /** Parameter out of capability range */
  PARAMS_OUT_OF_CAPABILITY: 9011,
  /** Unknown error */
  UNKNOWN: 9999
} as const

/**
 * String-Protocol command short codes live in the shared command catalog so
 * every layer can use the same type and runtime list.
 */
export { CMD, ALL_CMDS, isCmd } from '../../../common/commands'
export type { Cmd } from '../../../common/commands'

/**
 * Recommended heartbeat interval / reconnect / transaction ID ranges (§5.1.1 + transaction id §2).
 */
export const STRING_HEARTBEAT_MIN_MS = 5_000
export const STRING_HEARTBEAT_MAX_MS = 30_000
export const STRING_HEARTBEAT_DEFAULT_MS = 5_000

/** Per-transaction id upper bound (uint32). */
export const TRANSACTION_ID_MAX = 0xffffffff
