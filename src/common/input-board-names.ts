/**
 * Names for the input-signal dropdown.
 *
 * V10, V20, and VX20 use that model's 视频接口类型 table, matched on the
 * probed `srcType`. The same id is not borrowed across models: 0x11 is
 * HDMI1.4_IN on VX20 and is not an input interface on V10 or V20.
 *
 * U-series model sections are empty, so that family uses the SDK board-type
 * strings, matched on `boardKind` from `pr_vin_board` / `pr_video`.
 */

/** One named id from a model table. */
interface NamedId {
  id: number
  name: string
}

/** V10 and V20 share one input-interface table. */
const V10_V20_VIDEO_INTERFACES: readonly NamedId[] = [
  { id: 0x22, name: '12G_SDI_IN' },
  { id: 0x21, name: 'DP1.2_IN' },
  { id: 0x20, name: 'HDMI2.0_IN' }
]

/** VX20 input interfaces. 0x11 is HDMI1.4_IN on this model. */
const VX20_VIDEO_INTERFACES: readonly NamedId[] = [
  { id: 0x22, name: '12G_SDI_IN' },
  { id: 0x21, name: 'DP1.2_IN' },
  { id: 0x20, name: 'HDMI2.0_IN' },
  { id: 0x11, name: 'HDMI1.4_IN' },
  { id: 0x25, name: 'MOSAIC_IN' }
]

/**
 * U-series board types. Strings are the WEB names from
 * FunctionUtils::reflectBoardType, including the ST2110 4K/8K boards.
 */
const U_BOARD_TYPES: readonly NamedId[] = [
  { id: 0x10, name: 'DVIx4_IN' },
  { id: 0x11, name: 'HDMI1.3x4_IN' },
  { id: 0x12, name: '2INI1_IN' },
  { id: 0x13, name: '12G-SDIx4_IN' },
  { id: 0x14, name: 'HDMI2.1x1_IN' },
  { id: 0x15, name: 'DP1.4x4_IN' },
  { id: 0x16, name: '3G-SDIx4_IN' },
  { id: 0x17, name: 'DP1.4x2_IN' },
  { id: 0x18, name: 'MIXx8_IN' },
  { id: 0x19, name: '2SEL1_IN' },
  { id: 0x1a, name: '12G-SDI_LOOP_IN' },
  { id: 0x1b, name: 'HDMI2.0x2_IN' },
  { id: 0x1c, name: '12G-SDIx2_IN' },
  { id: 0x1d, name: '12G-SDIx1_IN' },
  { id: 0x1e, name: 'HDMI2.0_IN' },
  { id: 0x1f, name: 'DP1.2_IN' },
  { id: 0x20, name: 'VGAx4_IN' },
  { id: 0x21, name: 'VGAx2_CVBSx2_IN' },
  { id: 0x22, name: 'CVBSx4_IN' },
  { id: 0x23, name: '2IN1_IN_A' },
  { id: 0x24, name: 'IPx2_IN' },
  { id: 0x25, name: 'HDMI2.0_IN_A' },
  { id: 0x26, name: 'DP1.2_IN_A' },
  { id: 0x27, name: '12G-SDIx2_LOOPx2_IN' },
  { id: 0x2d, name: 'ST2110_IN' },
  { id: 0x2e, name: 'HDMI2.0x4_IN' },
  { id: 0x2f, name: 'DP1.2x4_IN' },
  { id: 0x30, name: 'HDMI1.4x4_IN' },
  { id: 0x31, name: 'HDMI1.3x6_IN' },
  { id: 0x32, name: 'HDMI2.0x2_DP1.2x2_IN' },
  { id: 0x33, name: '4SEL2_HDMI2.0x2_DP1.2x2_IN' },
  { id: 0x34, name: '4SEL2_HDMI2.0x2_IN' },
  { id: 0x35, name: '4SEL2_DP1.2x2_IN' },
  { id: 0x36, name: 'HDBaseTx4_IN' },
  { id: 0x37, name: 'HDMI1.3x8_IN' },
  { id: 0x38, name: 'HDMI1.3x4_IN_A' },
  { id: 0x39, name: 'MultiMedia_IN' },
  { id: 0x3a, name: 'DS40_IN' },
  { id: 0x3c, name: 'HDMI2.1x2_DP1.4x2_IN' },
  { id: 0x3d, name: 'HDMI2.1_IN' },
  { id: 0x3e, name: 'DP1.4_IN' },
  { id: 0x3f, name: 'GSV_HDMI2.1x1_DP1.4x1_IN' },
  { id: 0x40, name: 'SDVoEx2_IN' },
  { id: 0x41, name: 'HDMI2.1x2_DP2.1x2_IN' },
  { id: 0x46, name: '2SEL1_HDMI2.1x1_DP1.4x1_IN' },
  { id: 0x47, name: '4K_ST2110_4x25G_IN' },
  { id: 0x48, name: '8K_ST2110_2x100G_IN' },
  { id: 0x60, name: '3SEL2_IN' },
  { id: 0x80, name: '10G_FIBER_OUT' },
  { id: 0x81, name: 'RJ45x10_OUT' },
  { id: 0x82, name: 'RJ45x8_OUT' },
  { id: 0x83, name: '5Gx4_OUT' },
  { id: 0x84, name: 'RJ45x20_OUT' },
  { id: 0x85, name: '5G_FIBERx4_OUT' },
  { id: 0x86, name: '10G_FIBERx2_OUT' },
  { id: 0x87, name: '10G_FIBERx2_BACKUPx2_OUT' },
  { id: 0x88, name: 'MIX_5Gx6_OUT' },
  { id: 0x89, name: '5Gx8_40GFIBER_OUT' },
  { id: 0x8a, name: 'RJ45x12_OUT' },
  { id: 0x8b, name: 'RJ45x26_OUT' },
  { id: 0x8c, name: 'RJ45x6_OUT' },
  { id: 0x8d, name: 'RJ45x4_OUT' },
  { id: 0x8e, name: '5Gx8_OUT' },
  { id: 0x8f, name: '10G_FIBERx4_OUT' },
  { id: 0x90, name: 'OP' },
  { id: 0x91, name: '5Gx8_V2_OUT' },
  { id: 0x92, name: '10G_FIBERx4_V2_OUT' },
  { id: 0x93, name: '5G_FIBERx2_OUT' },
  { id: 0x96, name: 'FIBERx4_2x5G_OUT' },
  { id: 0x97, name: 'FIBERx4_4x5G_OUT' },
  { id: 0x98, name: 'FIBERx4_1x5G_OUT' },
  { id: 0x99, name: 'FIBERx4_2x1G_OUT' },
  { id: 0x9f, name: 'FIBERx4_1x10G_OUT' },
  { id: 0xa0, name: 'DVIx4_OUT' },
  { id: 0xa1, name: 'HDMIx4_OUT' },
  { id: 0xa4, name: 'HDMI1.4x4_OUT' },
  { id: 0xa5, name: 'HDMI1.3x6_OUT' },
  { id: 0xa6, name: '3G_SDIx4_OUT' },
  { id: 0xa7, name: '12G_SDIx4_OUT' },
  { id: 0xa8, name: 'HDBaseTx4_OUT' },
  { id: 0xa9, name: 'HDMI1.3x8_OUT' },
  { id: 0xab, name: 'MPOx4_OUT' },
  { id: 0xb0, name: 'HDMI2.0_OUT' },
  { id: 0xb1, name: 'HDMI2.0_COPY_OUT' },
  { id: 0xb2, name: 'HDMI2.0x2_COPYx2_OUT' },
  { id: 0xc0, name: 'previewBoard' },
  { id: 0xc1, name: 'previewBoardV3' },
  { id: 0xd0, name: 'audioBoard' },
  { id: 0xf0, name: 'mainBoard' },
  { id: 0xf1, name: 'backBoard' },
  { id: 0xf5, name: 'backBoard_P2' },
  { id: 0xf8, name: 'frontBoard' },
  { id: 0xf9, name: 'powerBoard' },
  { id: 0xfa, name: 'centralControlBoard' },
  { id: 0xfb, name: 'fanBoard' },
  { id: 0xfc, name: 'frontLightBoard' }
]

/** Video-interface rows for a probed model. U-series and unknown models have none. */
function videoInterfacesForModel(modelLabel: string | undefined): readonly NamedId[] {
  if (modelLabel === 'V10' || modelLabel === 'V20') return V10_V20_VIDEO_INTERFACES
  if (modelLabel === 'VX20') return VX20_VIDEO_INTERFACES
  return []
}

/**
 * Document name for a video-interface id.
 * An id outside that model's table is omitted from the dropdown.
 */
export function videoInterfaceName(modelLabel: string | undefined, srcType: number): string | undefined {
  return videoInterfacesForModel(modelLabel).find((item) => item.id === srcType)?.name
}

/**
 * Dropdown name for one probed signal, before the index is assigned.
 * U-series names come from the SDK board-type table. Other models use the
 * video-interface table and `srcType`. Undefined means the id is not in the
 * map, and the signal is left out of the dropdown.
 */
export function inputSignalName(
  modelLabel: string | undefined,
  source: { boardKind: number; srcType: number }
): string | undefined {
  if (modelLabel !== undefined && modelLabel.startsWith('U')) {
    return U_BOARD_TYPES.find((item) => item.id === source.boardKind)?.name
  }
  return videoInterfaceName(modelLabel, source.srcType)
}
