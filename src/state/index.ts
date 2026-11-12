import type { InputVideoSource } from '../common/input-video-sources'
import { DeviceProtocolEnum } from '../common/types'

/**
 * Runtime state cache.
 *
 * Holds values discovered from the device (probe identity and input signals)
 * and drives String-Protocol feedback refresh through the variable writeback.
 * `protocol` is probe-derived, so it lives here rather than in user config.
 */
class StateCache {
  /** Protocol selected by the UDP probe; None until a device is identified. */
  public protocol: DeviceProtocolEnum
  /** Probe-resolved device model byte; null = not probed / unidentified (see common/device-models.ts) */
  public modelByte: number | null
  /**
   * Input signals from `pr_vin_board` plus `pr_video`. Shared by video sync
   * and a later video-source action. Empty until the current link discovers them.
   */
  public inputVideoSources: InputVideoSource[]

  constructor() {
    this.protocol = DeviceProtocolEnum.None
    this.modelByte = null
    this.inputVideoSources = []
  }

  /** Clear every probe-derived value before a new link starts. */
  reset(): void {
    this.protocol = DeviceProtocolEnum.None
    this.modelByte = null
    this.inputVideoSources = []
  }
}

export { StateCache }
