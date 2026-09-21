// import type { StateContext } from '../types'

/**
 * state cache
 *
 * After refactoring: only triggers String-Protocol feedback ids.
 * The legacy V/Z feedback definitions (formerly src/feedbacks/) were
 * unregistered from Companion and the directory has been removed.
 */
class StateCache {
  /** Probe-resolved device model byte; null = not probed / unidentified (see device-models.ts) */
  public modelByte: number | null

  constructor() {
    this.modelByte = null
  }
}

export { StateCache }
