import type { SPTransmitter } from '../core/transmitter'
import { CMD } from '../core/constants'
import { logger } from '../../../common/log'
import { parseGroupIds } from '../../../common/protocol-data'
import { parseCanvasMode, selectQuickPresetGid } from './quick-preset-target'

/**
 * Resolve the screen group of the active PGM or PVW canvas on V/VX.
 *
 * Order is fixed: `pr_group` first, then `canvas_mode` on the lowest gid, then
 * one `pr_canvas` per group in list order. The first canvas whose type matches
 * the current mode is returned; the caller skips its action when undefined.
 *
 * `featureName` prefixes the skip warnings so quick preset and layer video
 * source keep their existing log text.
 */
export async function resolveCanvasTargetGid(
  conn: Pick<SPTransmitter, 'sendAndAwait'>,
  sid: number,
  featureName: 'Quick preset' | 'Layer video source'
): Promise<number | undefined> {
  const groupResp = await conn.sendAndAwait(CMD.PR_GROUP, 'get', sid)
  const groupIds = parseGroupIds(groupResp?.code === 0 ? groupResp.data : undefined)
  if (!groupIds) {
    logger.warn(`${featureName} skipped: pr_group did not return group ids.`)
    return undefined
  }

  /** Lowest group carries canvas mode, independent of list order. */
  const modeGid = Math.min(...groupIds)
  const modeResp = await conn.sendAndAwait<{ gid: number }, { mode?: unknown; valid?: unknown }>(
    CMD.CANVAS_MODE,
    'get',
    sid,
    { gid: modeGid }
  )
  const mode = parseCanvasMode(modeResp?.code === 0 ? modeResp.data : undefined)
  if (mode === undefined) {
    logger.warn(`${featureName} skipped: canvas_mode did not return mode 0 or 1.`)
    return undefined
  }

  for (const gid of groupIds) {
    const canvasResp = await conn.sendAndAwait<
      { gid: number },
      { gid?: unknown; canvasType?: unknown; fieldsValid?: unknown }
    >(CMD.PR_CANVAS, 'get', sid, { gid })
    const canvas = canvasResp?.code === 0 ? canvasResp.data : undefined
    // A failed read or a gid that does not match the request is not a candidate.
    if (!canvas || canvas.gid !== gid) continue
    const target = selectQuickPresetGid(mode, [
      {
        gid,
        canvasType: typeof canvas.canvasType === 'number' ? canvas.canvasType : -1,
        fieldsValid: typeof canvas.fieldsValid === 'number' ? canvas.fieldsValid : 0
      }
    ])
    if (target !== undefined) return target
  }

  logger.warn(`${featureName} skipped: canvas mode ${mode} does not have a target canvas.`)
  return undefined
}
