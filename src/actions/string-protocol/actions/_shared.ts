import type { SomeCompanionActionInputField } from '@companion-module/base'
import type { CltProcessorType } from '../../../types'
import type { SPTransmitter } from '../core/transmitter'
import type { StringResponse } from '../core/types'
import { GID_DEFAULT, SID_BROADCAST } from '../core/constants'
import { extractValuesForCmd } from '../../../variables/core/registry'
import { logger } from '../../../log'

/**
 * Minimal context shared across Action modules:
 *  - ctx: original CltProcessorType (holds config/state/send())
 *  - conn: SPTransmitter (handles the protocol layer)
 *  - setVariableValues: writeback hook (registered by CltProcessor) that
 *    dispatches `setVariableValues` on the InstanceBase. Provided as a
 *    function reference so action files stay free of module/instance
 *    imports for writeback.
 */
export interface StringActionHost {
  ctx: CltProcessorType
  conn: SPTransmitter
  /**
   * Write variable values back. Allows object values for composite
   * variables (e.g. `layer: {layer, x, y, width, height}`); Companion
   * preserves them at runtime even though `CompanionVariableValue`
   * nominally restricts to `string | number | boolean`.
   */
  setVariableValues: (values: Record<string, number | string | object>) => void
}

/**
 * Convert the UI options isSelectAll + deviceId into a protocol sid value.
 *  - isSelectAll=true → 255 (broadcast, see §4.2.5)
 *  - otherwise → deviceId (1-254)
 */
export function sidFromOptions(isSelectAll: boolean | undefined, deviceId: number | undefined): number {
  if (isSelectAll) return SID_BROADCAST
  const v = Number.isFinite(deviceId) ? Number(deviceId) : 1
  if (v < 1) return 1
  if (v > 254) return 254
  return v
}

/** Screen group gid field (used only when the protocol marks it as "optional", see §2) */
export function gidField(defaultValue: number = GID_DEFAULT, max = 128): SomeCompanionActionInputField {
  return {
    type: 'number',
    label: 'Screen group ID (gid)',
    id: 'gid',
    min: 1,
    max,
    default: defaultValue,
    required: false
  }
}

/** Open/Close dropdown */
export function openCloseField(defaultValue: 0 | 1 = 1): SomeCompanionActionInputField {
  return {
    type: 'dropdown',
    label: 'Open/Close',
    id: 'openStatus',
    tooltip: 'Open/Close',
    default: defaultValue,
    choices: [
      { id: 1, label: 'Open' },
      { id: 0, label: 'Close' }
    ]
  }
}

/** Open/Close/Toggle dropdown. Toggle id is numeric 2. */
export function openCloseToggleField(defaultValue: 0 | 1 | 2 = 1): SomeCompanionActionInputField {
  return {
    type: 'dropdown',
    label: 'Open/Close/Toggle',
    id: 'openStatus',
    tooltip: 'Open, close, or toggle the current state',
    default: defaultValue,
    choices: [
      { id: 1, label: 'Open' },
      { id: 0, label: 'Close' },
      { id: 2, label: 'Toggle' }
    ]
  }
}

/** Common device addressing fields: deviceId + isSelectAll */
export function deviceAndBroadcastFields(
  opts: { allowSelectAll?: boolean; deviceMax?: number } = {}
): SomeCompanionActionInputField[] {
  const fields: SomeCompanionActionInputField[] = [
    {
      type: 'number',
      label: 'Device ID',
      id: 'deviceId',
      min: 1,
      max: opts.deviceMax ?? 64,
      default: 1,
      required: true,
      isVisible: (action) => !(action.options as { isSelectAll?: boolean }).isSelectAll
    }
  ]
  if (opts.allowSelectAll !== false) {
    fields.push({
      type: 'checkbox',
      label: 'Send to all devices (sid=255)',
      id: 'isSelectAll',
      default: false
    })
  }
  return fields
}

/**
 * Shared helper for the standard "get" action shape.
 *
 * The action:
 *  1. Issues a `get` request for the given `cmd` against (sid, data).
 *  2. Awaits the response.
 *  3. On code=0 with non-null data, optionally runs `transformData(resp, o)`
 *     to reshape the response payload (e.g. pick a single entry from a list
 *     using values from the request), then extracts values matching the
 *     cmd's variable specs and writes them back via the host's
 *     `setVariableValues`.
 *  4. Runs `afterResponse(resp)` if provided — used by freeze/blackout
 *
 * Common addressing fields (`deviceAndBroadcastFields` + optional `gid`)
 * are prepended automatically; callers add only the cmd-specific params.
 *
 * `dataBuilder` returns the request data object for the get frame, e.g.
 * `({ gid }) => ({ gid })`. May be omitted for cmds whose get frame is
 * empty (sndinfo, cmdlist, ...).
 */
export function buildGetAction<TOpts extends { deviceId: number; isSelectAll?: boolean; gid?: number }>(
  host: StringActionHost,
  opts: {
    /** Display name (Companion UI). */
    name: string
    /** Short description. */
    description?: string
    /** Protocol cmd short-code. */
    cmd: string
    /** Extra input fields after deviceId/isSelectAll/gid. */
    extraFields?: SomeCompanionActionInputField[]
    /**
     * Skip the gid field. Use for commands that are device-level per the
     * protocol spec — i.e. commands with no screen-group dimension. The
     * spec marks the following as device-level (see `> **设备级命令**`
     * callouts in the spec):
     *   §5.2.13 portout       §5.2.14 allports      §5.2.38 uh5_st
     *   §5.3.1  sndinfo       §5.3.2  snd_eth        §5.3.5  pr_video
     *   §5.3.8  pr_video_count §5.3.x  cmdlist        §5.4.1  mfc_probe
     *   §5.4.2  rcv_probe      §5.4.3  mod_probe      §5.4.7  low_pwr
     *   §5.4.8  pr_rcv_state
     * For these, the get-frame must not carry `data.gid`.
     */
    skipGid?: boolean
    /** Build the get-frame data from the resolved options. */
    dataBuilder?: (o: TOpts) => Record<string, unknown> | undefined
    /**
     * Optional hook to reshape the response data before variable extraction.
     *
     * Use when the protocol response carries a list (e.g. `portout` get
     * returns `{ ports: [{idx, en}, ...] }`) and the user-facing variable
     * must be derived from one list entry — selected using values from the
     * original request (e.g. `o.port`).
     *
     * Return the data object to feed into `extractValuesForCmd`, or
     * `undefined` / `null` to skip extraction for this response.
     */
    transformData?: (resp: StringResponse<unknown>, o: TOpts) => unknown
    /** Optional hook fired on a successful response (code=0, data present). */
    afterResponse?: (resp: StringResponse<unknown>) => void
  }
): {
  name: string
  description?: string
  options: SomeCompanionActionInputField[]
  callback: (event: { options: Record<string, unknown> }) => Promise<void>
} {
  const fields: SomeCompanionActionInputField[] = [...deviceAndBroadcastFields()]
  if (opts.extraFields && opts.extraFields.length) fields.push(...opts.extraFields)
  if (!opts.skipGid) fields.push(gidField())

  return {
    name: opts.name,
    description: opts.description,
    options: fields,
    callback: async (event) => {
      const o = event.options as TOpts
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data = opts.dataBuilder ? opts.dataBuilder(o) : undefined
      const resp = await host.conn.sendAndAwait<unknown, unknown>(opts.cmd, 'get', sid, data)
      if (resp && resp.code === 0 && resp.data) {
        try {
          const finalData = opts.transformData ? opts.transformData(resp, o) : resp.data
          if (finalData !== undefined && finalData !== null) {
            const values = extractValuesForCmd(opts.cmd, finalData)
            if (Object.keys(values).length > 0) host.setVariableValues(values)
          }
        } catch (err) {
          logger.warn(`extractValuesForCmd(${opts.cmd}) failed: ${(err as Error).message ?? String(err)}`)
        }
        if (opts.afterResponse) {
          try {
            opts.afterResponse(resp)
          } catch (err) {
            logger.warn(`afterResponse(${opts.cmd}) threw: ${(err as Error).message ?? String(err)}`)
          }
        }
      }
    }
  }
}
