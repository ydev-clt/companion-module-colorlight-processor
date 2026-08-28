import type { SomeCompanionActionInputField } from '@companion-module/base'
import type { ActionContext } from '../../../types'
import type { SPTransmitter } from '../core/transmitter'
import { GID_DEFAULT, SID_BROADCAST } from '../core/constants'

/**
 * Minimal context shared across Action modules:
 *  - ctx: original ActionContext (holds config/state/send())
 *  - conn: SPTransmitter (handles the protocol layer)
 */
export interface StringActionHost {
  ctx: ActionContext
  conn: SPTransmitter
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
