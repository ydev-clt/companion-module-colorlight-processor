import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { deviceAndBroadcastFields, gidField, openCloseField, sidFromOptions } from './_shared'
import type { StringActionHost } from './_shared'

/**
 * Network port actions:
 *  - portout       (§5.2.13)
 *  - allports      (§5.2.14)
 *  - brt_port      (§5.2.18)
 *  - c_depth       (§5.2.19)
 *  - net_brt_en    (§5.2.31.3)  U-series screen group network-port brightness switch (B protocol only)
 */

export function setupPortActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- portout ----
  actions[ACTION_ID.PORTOUT] = {
    name: 'Switch Network Port Output',
    description: 'Enable or disable the specified network port output.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'Port index (1-based)', id: 'port', min: 1, max: 64, default: 1, required: true },
      openCloseField(1),
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        port: number
        openStatus: 0 | 1
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { port: o.port, en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.PORTOUT, 'set', sid, data)
    }
  }

  // ---- allports ----
  actions[ACTION_ID.ALLPORTS] = {
    name: 'Switch All Network Ports Output',
    description: 'Enable or disable output on all network ports.',
    options: [...deviceAndBroadcastFields(), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; openStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.ALLPORTS, 'set', sid, data)
    }
  }

  // ---- brt_port ----
  actions[ACTION_ID.BRT_PORT] = {
    name: 'Set Network Port Brightness',
    description: 'Set the brightness of a specific network port on the sender.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'Port index (1-based)', id: 'port', min: 1, max: 64, default: 1, required: true },
      {
        type: 'number',
        label: 'Brightness (0-10000)',
        id: 'brt',
        min: 0,
        max: 10000,
        default: 5000,
        required: true
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; port: number; brt: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { port: o.port, brt: o.brt }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.BRT_PORT, 'set', sid, data)
    }
  }

  // ---- c_depth ----
  actions[ACTION_ID.C_DEPTH] = {
    name: 'Set Network Port Color Depth',
    description: 'Set the color depth of the network port output.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'Port index', id: 'port', min: 1, max: 64, default: 1, required: true },
      {
        type: 'dropdown',
        label: 'Color depth (bit)',
        id: 'depth',
        default: 8,
        choices: [
          { id: 8, label: '8-bit' },
          { id: 10, label: '10-bit' },
          { id: 12, label: '12-bit' }
        ]
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; port: number; depth: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { port: o.port, depth: o.depth }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.C_DEPTH, 'set', sid, data)
    }
  }

  // ---- net_brt_en (U-series group network-port brightness switch) ----
  actions[ACTION_ID.NET_BRT_EN] = {
    name: 'Switch Network Port Group Brightness Enable',
    description: 'Master switch for network-port brightness on U-series screen groups.',
    options: [...deviceAndBroadcastFields({ allowSelectAll: false }), openCloseField(1), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; openStatus: 0 | 1; gid?: number }
      const sid = sidFromOptions(false, o.deviceId)
      const data: Record<string, unknown> = { en: o.openStatus }
      if (typeof o.gid === 'number') data.gid = o.gid
      await conn.sendOnly(CMD.NET_BRT_EN, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}
