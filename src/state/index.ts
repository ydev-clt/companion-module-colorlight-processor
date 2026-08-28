import type { StateContext } from '../types'
import { FEEDBACK_ID as STRING_FEEDBACK_ID } from '../actions/string-protocol/core/ids'
import { logger } from '../log'

/**
 * state cache
 *
 * After refactoring: only triggers String-Protocol feedback ids.
 * The legacy V/Z feedback definitions (formerly src/feedbacks/) were
 * unregistered from Companion and the directory has been removed.
 */
class StateCache {
  private context: StateContext
  public blackScreen: boolean
  public freezeScreen: boolean

  constructor(context: StateContext) {
    this.context = context

    this.blackScreen = false
    this.freezeScreen = false
  }

  get isBlackScreen(): boolean {
    return this.blackScreen
  }

  set isBlackScreen(value: boolean) {
    this.blackScreen = value

    logger.info(`Black screen state changed: ${value}`)

    this.context.triggerFeedbacks(STRING_FEEDBACK_ID.BLACKOUT)
  }

  get isFreezeScreen(): boolean {
    return this.freezeScreen
  }

  set isFreezeScreen(value: boolean) {
    this.freezeScreen = value

    logger.info(`Freeze screen state changed: ${value}`)

    this.context.triggerFeedbacks(STRING_FEEDBACK_ID.FREEZE_SCREEN)
  }
}

export { StateCache }
