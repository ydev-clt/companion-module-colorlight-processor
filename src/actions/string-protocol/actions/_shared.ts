import type { DropdownChoice, SomeCompanionActionInputField } from '@companion-module/base'
import type { CltProcessorType } from '../../../common/types'
import type { DeviceIdentity } from '../../../common/cmd-support'
import { resolveDeviceModel } from '../../../common/device-models'
import { inputVideoSourceChoices } from '../../../common/input-video-sources'
import type { SPTransmitter } from '../core/transmitter'
import { GID_DEFAULT, SID_BROADCAST } from '../core/constants'

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
export function sidFromOptions(isSelectAll: boolean | undefined, deviceId: number | string | undefined): number {
  if (isSelectAll) return SID_BROADCAST
  const v = Number(deviceId)
  if (!Number.isFinite(v) || v < 1) return 1
  if (v > 254) return 254
  return Math.trunc(v)
}

/** Probe-derived identity used by action support checks. */
export function deviceIdentity(host: StringActionHost): DeviceIdentity {
  return { protocol: host.ctx.config.protocol, modelByte: host.ctx.state.modelByte }
}

/** Optional `{ gid }` fragment. A number is kept even when it is 0, matching older saved buttons. */
export function gidData(gid: unknown): { gid?: number } {
  return typeof gid === 'number' ? { gid } : {}
}

/** Request data that omits the `data` field entirely when the button has no gid. */
export function requestGid(gid: unknown): { gid: number } | undefined {
  return typeof gid === 'number' ? { gid } : undefined
}

/** Attach `gid` to a request body when the button supplied one. */
export function withGid(gid: unknown, data: Record<string, unknown>): Record<string, unknown> {
  if (typeof gid === 'number') data.gid = gid
  return data
}

/** Read a finite number from a response field; missing, null, non-numeric, NaN and Infinity are undefined. */
export function finiteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

/** Input-signal dropdown rows from the last successful probe. */
export function inputSourceChoices(host: StringActionHost): DropdownChoice[] {
  const identity = deviceIdentity(host)
  const modelLabel = resolveDeviceModel(identity.protocol, identity.modelByte)?.label
  return inputVideoSourceChoices(host.ctx.state.inputVideoSources ?? [], modelLabel)
}

/** Screen group gid field (used only when the protocol marks it as "optional", see §2) */
export function gidField(
  defaultValue: number = GID_DEFAULT,
  max = 128,
  label = 'Screen group ID (gid)'
): SomeCompanionActionInputField {
  return {
    type: 'number',
    label,
    id: 'gid',
    min: 1,
    max,
    default: defaultValue
  }
}

/** Enable/Disable dropdown */
export function openCloseField(
  defaultValue: 0 | 1 = 1,
  opts: { disableAutoExpression?: boolean } = {}
): SomeCompanionActionInputField {
  return {
    type: 'dropdown',
    label: 'Operation',
    id: 'enableStatus',
    tooltip: 'enable/disable',
    default: defaultValue,
    choices: [
      { id: 1, label: 'enable' },
      { id: 0, label: 'disable' }
    ],
    ...(opts.disableAutoExpression ? { disableAutoExpression: true } : {})
  }
}

/** Enable/Disable/Toggle dropdown. Toggle id is numeric 2. */
export function openCloseToggleField(defaultValue: 0 | 1 | 2 = 1): SomeCompanionActionInputField {
  return {
    type: 'dropdown',
    label: 'Operation',
    id: 'enableStatus',
    tooltip: 'Enable, disable, or toggle the current state',
    default: defaultValue,
    choices: [
      { id: 1, label: 'Enable' },
      { id: 0, label: 'Disable' },
      { id: 2, label: 'Toggle' }
    ]
  }
}

/** Common device addressing fields: deviceId + isSelectAll */
export function deviceAndBroadcastFields(
  opts: { allowSelectAll?: boolean; deviceMax?: number } = {}
): SomeCompanionActionInputField[] {
  const allowSelectAll = opts.allowSelectAll !== false
  const fields: SomeCompanionActionInputField[] = [
    {
      type: 'number',
      label: 'Device ID',
      id: 'deviceId',
      default: 1,
      min: 1,
      max: opts.deviceMax ?? 64,
      ...(allowSelectAll ? { isVisibleExpression: '!$(options:isSelectAll)' } : {})
    }
  ]
  if (allowSelectAll) {
    fields.push({
      type: 'checkbox',
      label: 'Send to all devices (sid=255)',
      id: 'isSelectAll',
      default: false,
      disableAutoExpression: true
    })
  }
  return fields
}
