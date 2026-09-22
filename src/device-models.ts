import { DeviceProtocolEnum } from './types'
import { logger } from './log'

/**
 * Device model registry — single source of truth for "model byte → device
 * identity" (label / protocol / model family).
 *
 * The model byte is field 16 「处理器型号低位」 of the 0xEA probe response
 * (offset 23); sender cards (deviceType 0) report it via the secondary 0xF1
 * reply (offset 12) — see src/udp-probe.ts.
 *
 * Families: devices in the same family share identical action support.
 * Entries without a family are record-only: they resolve the identity (so
 * actions show per the protocol baseline) but never participate in
 * only/except judgment.
 * See docs/superpowers/specs/2026-09-14-device-model-support-design.md.
 */

/** Model families currently participating in action-support judgment. */
export const DEVICE_FAMILIES = ['U', 'V'] as const
export type DeviceFamilyId = (typeof DEVICE_FAMILIES)[number]

export interface DeviceModelInfo {
  /** 「处理器型号低位」byte value (0xEA offset 23 / 0xF1 offset 12) */
  readonly modelByte: number
  readonly label: string
  /** Family tag; absent = record-only, does not participate in support judgment */
  readonly family?: DeviceFamilyId
}

/**
 * B-Protocol model registry (53 entries; doc values 17 / 18 do not exist).
 * Data source: B-Protocol doc 「处理器型号低位」table, transcribed 2026-09-14.
 */
export const B_DEVICE_MODELS: Record<string, DeviceModelInfo> = {
  // V20: { modelByte: 1, label: 'V20' },
  // Z8: { modelByte: 2, label: 'Z8' },
  // X100_4U: { modelByte: 3, label: 'X100-4U' },
  // X100_7U: { modelByte: 4, label: 'X100-7U' },
  // X40M: { modelByte: 5, label: 'X40m' },
  // D9: { modelByte: 6, label: 'D9' },
  // D16: { modelByte: 7, label: 'D16' },
  // AVATAR: { modelByte: 8, label: '阿凡达' },
  // Z5: { modelByte: 9, label: 'Z5' },
  // Z4_PRO: { modelByte: 10, label: 'Z4 PRO' },
  // X20M: { modelByte: 11, label: 'X20m' },
  // Z8T: { modelByte: 12, label: 'Z8t' },
  // V3_PRO: { modelByte: 13, label: 'V3Pro' },
  // V3: { modelByte: 14, label: 'V3' },
  // V2_PRO: { modelByte: 15, label: 'V2Pro' },
  // V2: { modelByte: 16, label: 'V2' },
  // Z3: { modelByte: 19, label: 'Z3' },
  // V4: { modelByte: 20, label: 'V4' },
  // V7: { modelByte: 21, label: 'V7' },
  // Z8L: { modelByte: 22, label: 'Z8l' },
  // VX10: { modelByte: 23, label: 'VX10' },
  // X100_PRO_4U: { modelByte: 24, label: 'X100 Pro-4U' },
  // X100_PRO_7U: { modelByte: 25, label: 'X100 Pro-7U' },
  // X100_PRO_11U: { modelByte: 26, label: 'X100 Pro-11U' },
  // X100_20U: { modelByte: 27, label: 'X100-20U' },
  // S20_PRO: { modelByte: 28, label: 'S20 Pro' },
  // X12M: { modelByte: 29, label: 'X12m' },
  // X8M: { modelByte: 30, label: 'X8m' },
  // X26M: { modelByte: 31, label: 'X26m' },
  // VX6: { modelByte: 32, label: 'VX6' },
  // VX4: { modelByte: 33, label: 'VX4' },
  // VX20: { modelByte: 34, label: 'VX20' },
  U9_MAX: { modelByte: 35, label: 'U9 Max', family: 'U' },
  // X100_PRO_2U: { modelByte: 36, label: 'X100 Pro-2U' },
  // DS420: { modelByte: 37, label: 'DS420' },
  U15: { modelByte: 38, label: 'U15', family: 'U' },
  U15_MAX: { modelByte: 39, label: 'U15 Max', family: 'U' },
  // DS410: { modelByte: 40, label: 'DS410' },
  U6_MAX: { modelByte: 41, label: 'U6 Max', family: 'U' },
  // VX12F: { modelByte: 42, label: 'VX12F' },
  // CA6: { modelByte: 43, label: 'CA6' },
  // CA20_5G: { modelByte: 44, label: 'CA20-5G' },
  // CA10: { modelByte: 45, label: 'CA10' },
  // CA20: { modelByte: 46, label: 'CA20' },
  U3_MAX: { modelByte: 47, label: 'U3 Max', family: 'U' },
  // CA_AGGREGATE: { modelByte: 48, label: 'CA6_CA20-5G_CA10_CA20 (4-product aggregate, ledupgrade)' },
  U20_MAX: { modelByte: 49, label: 'U20 Max', family: 'U' },
  V10: { modelByte: 50, label: 'V10', family: 'V' },
  V20: { modelByte: 51, label: 'V20', family: 'V' }
  // MVC_5G_11: { modelByte: 200, label: 'MVC-5G-11' },
  // LUOPU_CINEMA_SCREEN: { modelByte: 201, label: '洛普电影屏' },
  // CL14_4KP60: { modelByte: 202, label: 'CL14-4KP60' },
  // CJ4K: { modelByte: 203, label: 'CJ4K' },
  // CU4K: { modelByte: 204, label: 'CU4K' },
  // HDR4K_JIUZHOU: { modelByte: 205, label: 'HDR4K_JIUZHOU' }
}

/**
 * A-Protocol model registry — same structure as B. Data pending: while
 * empty, resolveDeviceModel returns undefined for every A model byte and
 * the global strict gate registers no actions (spec §行为变化).
 */
export const A_DEVICE_MODELS: Record<string, DeviceModelInfo> = {}

/** Byte-value uniqueness self-check (numeric dupes cannot be caught by types). */
function buildModelIndex(
  table: Record<string, DeviceModelInfo>,
  tableName: string
): ReadonlyMap<number, DeviceModelInfo> {
  const index = new Map<number, DeviceModelInfo>()
  for (const [key, info] of Object.entries(table)) {
    if (index.has(info.modelByte)) {
      logger.error(
        `device-models: duplicate modelByte ${info.modelByte} in ${tableName} ('${key}' shadows an earlier entry) — later entry ignored`
      )
      continue
    }
    index.set(info.modelByte, info)
  }
  return index
}

const B_MODEL_INDEX = buildModelIndex(B_DEVICE_MODELS, 'B_DEVICE_MODELS')
const A_MODEL_INDEX = buildModelIndex(A_DEVICE_MODELS, 'A_DEVICE_MODELS')

/**
 * Resolve a model byte against the protocol's registry.
 * Returns undefined when: not probed (null/undefined), short-packet sentinel
 * (-1), or the byte is absent from the table (unknown/new model).
 */
export function resolveDeviceModel(
  protocol: DeviceProtocolEnum,
  modelByte: number | null | undefined
): DeviceModelInfo | undefined {
  if (modelByte === null || modelByte === undefined || modelByte < 0) return undefined
  const index =
    protocol === DeviceProtocolEnum.B ? B_MODEL_INDEX : protocol === DeviceProtocolEnum.A ? A_MODEL_INDEX : undefined
  return index?.get(modelByte)
}
