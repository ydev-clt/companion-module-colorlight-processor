// import type { StateContext } from '../common/types'
import type { InputVideoSource } from '../common/input-video-sources'

/**
 * state cache
 *
 * After refactoring: only triggers String-Protocol feedback ids.
 * The legacy V/Z feedback definitions (formerly src/feedbacks/) were
 * unregistered from Companion and the directory has been removed.
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
