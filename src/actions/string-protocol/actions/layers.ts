import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { logger } from '../../../common/log'
import { resolveDeviceModel } from '../../../common/device-models'
import { inputVideoSourceChoiceId, type InputVideoSource } from '../../../common/input-video-sources'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import {
  deviceAndBroadcastFields,
  deviceIdentity,
  gidField,
  inputSourceChoices,
  sidFromOptions,
  withGid
} from './_shared'
import type { StringActionHost } from './_shared'
import { resolveCanvasTargetGid } from './canvas-target'

/**
 * Layer management actions:
 *  - layer          (§5.2.15)        Position and size
 *  - layer_border   (§5.2.15.3)      Layer border switch (B protocol only)
 *  - bg_box         (§5.2.17)        Background box size
 *  - layerorder     (§5.2.25.1)      Layer ordering (B protocol only)
 *  - dellayer       (§5.2.27)        Delete layer (B protocol only)
 *  - clear_layer    (§5.2.28)        Clear layers (B protocol only)
 *  - videosrc       (§5.2.5.3)       Layer video source
 */

/**
 * One `videosrc` set body.
 * The button id must match a signal in the current probe list. `src` is that
 * record's `srcIdx`, and `slotCode` is the probed slot, including 0. An id
 * missing from the list returns undefined.
 */
function videosrcSetData(input: {
  layer: number
  gid?: number
  /** Choice id stored on the button. */
  inputSource: string
  sources: readonly InputVideoSource[]
}): Record<string, unknown> | undefined {
  const source = input.sources.find((item) => inputVideoSourceChoiceId(item) === input.inputSource)
  if (!source) return undefined
  return withGid(input.gid, {
    layer: input.layer,
    src: source.srcIdx,
    slotCode: source.slotCode
  })
}

export function setupLayerActions(host: StringActionHost): CompanionActionDefinitions {
  const { conn } = host
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- layer ----
  actions[ACTION_ID.LAYER_SET] = {
    name: 'Set Layer Position/Size',
    description: 'Set the layer position and size.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Layer index (1-based)',
        id: 'layer',
        min: 1,
        max: 16,
        default: 1
      },
      { type: 'number', label: 'X (left)', id: 'x', min: 0, max: 65535, default: 0 },
      { type: 'number', label: 'Y (top)', id: 'y', min: 0, max: 65535, default: 0 },
      { type: 'number', label: 'Width', id: 'w', min: 1, max: 65535, default: 1920 },
      { type: 'number', label: 'Height', id: 'h', min: 1, max: 65535, default: 1080 },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        layer: number
        x: number
        y: number
        w: number
        h: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { layer: o.layer, x: o.x, y: o.y, w: o.w, h: o.h }
      withGid(o.gid, data)
      await conn.sendOnly(CMD.LAYER, 'set', sid, data)
    }
  }

  // ---- layer_border ----
  actions[ACTION_ID.LAYER_BORDER_SET] = {
    name: 'Set Layer Border',
    description: 'Configure the layer border (B protocol only).',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Layer index (1-based)',
        id: 'layer',
        min: 1,
        max: 16,
        default: 1
      },
      {
        type: 'dropdown',
        label: 'Border on/off',
        id: 'openStatus',
        default: 1,
        choices: [
          { id: 1, label: 'On' },
          { id: 0, label: 'Off' }
        ]
      },
      {
        type: 'checkbox',
        label: 'Apply to all layers',
        id: 'all',
        default: false
      },
      {
        type: 'number',
        label: 'Opacity (0-100)',
        id: 'opacity',
        min: 0,
        max: 100,
        default: 100
      },
      {
        type: 'number',
        label: 'Width (1-32 px)',
        id: 'width',
        min: 1,
        max: 32,
        default: 2
      },
      { type: 'number', label: 'R (0-255)', id: 'r', min: 0, max: 255, default: 0 },
      { type: 'number', label: 'G (0-255)', id: 'g', min: 0, max: 255, default: 0 },
      { type: 'number', label: 'B (0-255)', id: 'b', min: 0, max: 255, default: 0 },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        layer: number
        openStatus: 0 | 1
        all: boolean
        opacity: number
        width: number
        r: number
        g: number
        b: number
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = {
        layer: o.layer,
        en: o.openStatus,
        all: o.all ? 1 : 0,
        opacity: o.opacity,
        width: o.width,
        r: o.r,
        g: o.g,
        b: o.b
      }
      withGid(o.gid, data)
      await conn.sendOnly(CMD.LAYER_BORDER, 'set', sid, data)
    }
  }

  // ---- bg_box ----
  actions[ACTION_ID.BG_BOX_SET] = {
    name: 'Set Background Box Size',
    description: 'Set the background box size.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'Width', id: 'w', min: 1, max: 65535, default: 1920 },
      { type: 'number', label: 'Height', id: 'h', min: 1, max: 65535, default: 1080 },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; w: number; h: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { w: o.w, h: o.h }
      withGid(o.gid, data)
      await conn.sendOnly(CMD.BG_BOX, 'set', sid, data)
    }
  }

  // ---- layerorder ---- (§5.2.25.1 set; set-only)
  actions[ACTION_ID.LAYER_ORDER] = {
    name: 'Set Layer Order',
    description:
      'Move a layer relative to a target layer. Layer numbers are 1-based (1 = bottom). To bring a layer to the very bottom, set layer=<index>, target=1, pos=Below target.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Layer (1-based, 1 = bottom)',
        id: 'layer',
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        default: 1
      },
      {
        type: 'number',
        label: 'Target layer (1-based, 1 = bottom)',
        id: 'target',
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        default: 1
      },
      {
        type: 'dropdown',
        label: 'Position relative to target',
        id: 'pos',
        default: 0,
        choices: [
          { id: 0, label: 'Below target' },
          { id: 1, label: 'Above target' }
        ]
      },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        layer: number
        target: number
        pos: 0 | 1
        gid?: number
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { layer: o.layer, target: o.target, pos: o.pos }
      withGid(o.gid, data)
      await conn.sendOnly(CMD.LAYERORDER, 'set', sid, data)
    }
  }

  // ---- dellayer ---- (set-only)
  actions[ACTION_ID.DEL_LAYER] = {
    name: 'Delete Layer',
    description: 'Delete a layer.',
    options: [
      ...deviceAndBroadcastFields(),
      { type: 'number', label: 'Layer index to delete', id: 'layer', min: 1, max: 16, default: 1 },
      gidField()
    ],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; layer: number; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { layer: o.layer }
      withGid(o.gid, data)
      await conn.sendOnly(CMD.DELLAYER, 'set', sid, data)
    }
  }

  // ---- clear_layer ---- (set-only)
  actions[ACTION_ID.CLEAR_LAYER] = {
    name: 'Clear All Layers',
    description: 'Clear all layers in the specified screen group.',
    options: [...deviceAndBroadcastFields(), gidField()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean; gid?: number }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      const data: Record<string, unknown> = { clear: 1 }
      withGid(o.gid, data)
      await conn.sendOnly(CMD.CLEAR_LAYER, 'set', sid, data)
    }
  }

  const inputChoices = inputSourceChoices(host)
  const identity = deviceIdentity(host)
  const family = resolveDeviceModel(identity.protocol, identity.modelByte)?.family
  /** V and VX choose the screen group from canvas mode, the same way quick preset does. */
  const usesCanvasTarget = family === 'V' || family === 'VX'
  actions[ACTION_ID.VIDEOSRC_SET] = {
    name: 'Set Layer Video Source',
    description: usesCanvasTarget
      ? 'According to the current canvas mode, change the layer video source on PGM or PVW.'
      : 'Switch the input signal bound to a layer.',
    options: [
      ...deviceAndBroadcastFields(),
      {
        type: 'number',
        label: 'Layer index (1-based)',
        id: 'layer',
        min: 1,
        max: 16,
        default: 1
      },
      {
        type: 'dropdown',
        label: 'Input signal',
        id: 'inputSource',
        default: inputChoices[0]?.id ?? '',
        choices: inputChoices,
        minChoicesForSearch: 8
      },
      ...(usesCanvasTarget ? [] : [gidField()])
    ],
    callback: async (event) => {
      const o = event.options as {
        deviceId: number
        isSelectAll: boolean
        layer: number
        inputSource: string
        gid?: number
      }
      const data = videosrcSetData({
        layer: o.layer,
        // V/VX ignore a leftover button gid and replace it with the canvas target.
        gid: usesCanvasTarget ? undefined : o.gid,
        inputSource: o.inputSource,
        sources: host.ctx.state.inputVideoSources ?? []
      })
      if (!data) {
        logger.warn('Layer video source skipped: the selected signal is not in the current list.')
        return
      }
      const sid = sidFromOptions(o.isSelectAll, o.deviceId)
      if (usesCanvasTarget) {
        const gid = await resolveCanvasTargetGid(conn, sid, 'Layer video source')
        if (gid === undefined) return
        data.gid = gid
      }
      await conn.sendOnly(CMD.VIDEOSRC, 'set', sid, data)
    }
  }

  return actions as CompanionActionDefinitions
}
