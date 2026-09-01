import type { DeviceConfig } from './types'
import { DeviceProtocolEnum } from './types'

/**
 * Parsed result of a single 0xEA UDP probe response.
 */
export interface ProbeResult {
  /** Device model byte — used as MODEL_TO_PROTOCOL key (0xEA offset 23) */
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
 * Parses an 0xEA probe response. Returns `null` if the packet is too short,
 * has a wrong frame id, or otherwise malformed.
 *
 * Only `model` and `deviceType` are extracted; other fields are intentionally
 * ignored (not part of MODEL_TO_PROTOCOL).
 */
export function parseProbeResponse(buf: Buffer): ProbeResult | null {
  if (!buf || buf.length < 23) return null
  if (buf[0] !== 0xea) return null
  return {
    model: buf[23],
    deviceType: buf[22] as ProbeResult['deviceType'],
    raw: Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  }
}
