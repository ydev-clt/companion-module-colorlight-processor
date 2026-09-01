import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import type { FeedbackContext } from '../types'
import { FEEDBACK_ID } from '../actions/string-protocol/core/ids'
import { logger } from '../log'
import { setupFreezeScreenFeedback } from './freeze-screen'
import { setupBlackoutFeedback } from './blackout'

/**
 * Feedbacks aggregator.
 */
export function setupFeedbacks(context: FeedbackContext): CompanionFeedbackDefinitions {
  logger.info('Feedbacks setup start.')

  const feedbacks: CompanionFeedbackDefinitions = {
    [FEEDBACK_ID.FREEZE_SCREEN]: setupFreezeScreenFeedback(context),
    [FEEDBACK_ID.BLACKOUT]: setupBlackoutFeedback(context)
  }

  logger.info(`Feedbacks setup completed. (${Object.keys(feedbacks).length} feedbacks registered)`)
  return feedbacks
}

export { FEEDBACK_ID as STRING_FEEDBACK_ID } from '../actions/string-protocol/core/ids'
