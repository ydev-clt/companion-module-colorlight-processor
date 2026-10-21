export const PROBE_FRAME_MAX_LENGTH = 1024

export type ProbeFrameRead =
  | { status: 'need-header' }
  | { status: 'need-more' }
  | { status: 'bad-length' }
  | { status: 'frame'; frame: Buffer }

/** Read one length-prefixed probe frame. Offset 2 is the little-endian total length. */
export function readProbeFrame(buffer: Buffer): ProbeFrameRead {
  if (buffer.length < 4) return { status: 'need-header' }
  const length = buffer.readUInt16LE(2)
  if (length < 4 || length > PROBE_FRAME_MAX_LENGTH) return { status: 'bad-length' }
  if (buffer.length < length) return { status: 'need-more' }
  return { status: 'frame', frame: Buffer.from(buffer.subarray(0, length)) }
}
