// import type { StateContext } from '../common/types'
import type { InputVideoSource } from '../common/input-video-sources'

/**
 * Runtime state cache.
 *
 * Holds values discovered from the device (probe identity and input signals)
 * and drives String-Protocol feedback refresh through the variable writeback.
 */
class StateCache {
  /** Probe-resolved device model byte; null = not probed / unidentified (see common/device-models.ts) */
  public modelByte: number | null
  /**
   * Input signals from `pr_vin_board` plus `pr_video`. Shared by video sync
   * and a later video-source action. Empty until the current link discovers them.
   */
  public inputVideoSources: InputVideoSource[]

  constructor() {
    this.modelByte = null
    this.inputVideoSources = []
  }
}

export { StateCache }
