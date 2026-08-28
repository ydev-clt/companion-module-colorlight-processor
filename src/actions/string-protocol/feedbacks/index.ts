import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import type { FeedbackContext } from '../../../types'
import { FEEDBACK_ID } from '../core/ids'
import { logger } from '../../../log'
import { setupStringFreezeScreenFeedback } from './freeze-screen'
import { setupStringBlackoutFeedback } from './blackout'

/**
 * String-Protocol feedbacks aggregator.
 *  - Registered only in the String-Protocol branch of src/index.ts.
 *  - Registered separately from PV/Z protocol feedbacks (id-prefixed) to avoid clashes.
 */
export function setupStringFeedbacks(context: FeedbackContext): CompanionFeedbackDefinitions {
  logger.info('String-Protocol feedbacks setup start.')

  const feedbacks: CompanionFeedbackDefinitions = {
    [FEEDBACK_ID.FREEZE_SCREEN]: setupStringFreezeScreenFeedback(context),
    [FEEDBACK_ID.BLACKOUT]: setupStringBlackoutFeedback(context)
  }

  logger.info(`String-Protocol feedbacks setup completed. (${Object.keys(feedbacks).length} feedbacks registered)`)
  return feedbacks
}

export { FEEDBACK_ID as STRING_FEEDBACK_ID } from '../core/ids'
