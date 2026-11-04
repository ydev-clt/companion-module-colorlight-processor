import type { SomeCompanionActionInputField } from '@companion-module/base'
import type { CltProcessorType } from '../../../common/types'
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

/** Open/Close dropdown */
export function openCloseField(
  defaultValue: 0 | 1 = 1,
  opts: { disableAutoExpression?: boolean } = {}
): SomeCompanionActionInputField {
  return {
    type: 'dropdown',
    label: 'enable/disable',
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

/** Open/Close/Toggle dropdown. Toggle id is numeric 2. */
export function openCloseToggleField(defaultValue: 0 | 1 | 2 = 1): SomeCompanionActionInputField {
  return {
    type: 'dropdown',
    label: 'enable/disable/toggle',
    id: 'enableStatus',
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
