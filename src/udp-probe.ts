import type { DeviceConfig } from './types'
import { DeviceProtocolEnum } from './types'

/**
 * Parsed result of a single 0xEA UDP probe response.
 */
export interface ProbeResult {
  /**
   * Device model byte.
   *  - deviceType 1/2: 0xEA offset 23
   *  - deviceType 0: 0xF1 secondary response offset 12 (resolved by Connection;
   *    0 = the secondary query timed out / failed and the model is unknown)
   * Resolved to a registry entry via `resolveDeviceModel` (src/device-models.ts).
   */
  model: number
  /** Device type byte (0xEA offset 22): 0=Sender card / 1=Player box / 2=Processor */
  deviceType: 0 | 1 | 2
  /** Raw response buffer — kept for debugging */
  raw: Buffer
}

export function getProtocolForDeviceType(deviceType: number): DeviceConfig['protocol'] | undefined {
  return deviceType === 2 ? DeviceProtocolEnum.B : DeviceProtocolEnum.A
}

/**
 * Builds the 9-byte 0xEB probe request.
 *
 * Layout (per protocol doc §6.2.1):
 *   [0]    0xEB         Frame number
 *   [1]    0x00         Reserved
 *   [2..3] 0x00 0x09    Frame length (LE)
 *   [4]    0x01         Sub-frame type = search IP device
 *   [5..7] 0x55 0xEE 0xCC Frame data
 *   [8]    0x00         CRC (not enabled)
 */
export function buildProbeRequest(): Buffer {
  return Buffer.from([0xeb, 0x00, 0x00, 0x09, 0x01, 0x55, 0xee, 0xcc, 0x00])
}

/**
 * Builds the 17-byte sender-card model query request — the second probe
 * stage, sent when the 0xEA deviceType byte is 0 (sender cards do not carry
 * the model in the 0xEA frame).
 *
 * Layout (fixed frame, no CRC):
 *   [0]    0x01         Frame number
 *   [1]    0x00         Reserved
 *   [2..3] 0x11 0x00    Frame length (LE) = 17
 *   [4..16] fixed payload 00 00 00 00 ff 00 00 00 00 00 01 00 16
 *
 * The device answers with an 0xF1-prefixed reply (parseSenderModelResponse).
 */
export function buildSenderModelRequest(): Buffer {
  return Buffer.from([
    0x01, 0x00, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x16
  ])
}

/**
 * Parses the 0xF1-prefixed reply to buildSenderModelRequest(). Returns the
 * device model byte (offset 12) or `null` if the packet is too short or has
 * a wrong frame id.
 */
export function parseSenderModelResponse(buf: Buffer): number | null {
  if (!buf || buf.length < 13) return null
  if (buf[0] !== 0xf1) return null
  return buf[12]
}

/**
 * Parses an 0xEA probe response. Returns `null` if the packet is too short,
 * has a wrong frame id, or otherwise malformed.
 *
 * Only `model` and `deviceType` are extracted; other fields are intentionally
 * ignored. Note: for deviceType 0 the returned `model` (offset 23) is NOT
 * meaningful — Connection replaces it via the secondary 0xF1 model query
 * (see buildSenderModelRequest).
 */
export function parseProbeResponse(buf: Buffer): ProbeResult | null {
  // offset 22 (deviceType) must be readable → require ≥23 bytes. Some devices
  // (e.g. sender cards) reply with exactly 23 bytes and no model byte at all;
  // those report model=0 here — for deviceType 0 the real model comes from the
  // secondary 0xF1 query anyway.
  if (!buf || buf.length < 23) return null
  if (buf[0] !== 0xea) return null
  return {
    model: buf.length > 23 ? buf[23] : -1,
    deviceType: buf[22] as ProbeResult['deviceType'],
    raw: Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  }
}
