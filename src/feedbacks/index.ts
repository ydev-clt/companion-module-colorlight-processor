import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import type { CltProcessorType } from '../common/types'
import { FEEDBACK_ID } from '../common/feedback-ids'
import { logger } from '../common/log'
import { setupFreezeScreenFeedback } from './freeze-screen'
import { setupBlackoutFeedback } from './blackout'
import { setupLowGrayFeedback } from './low-gray'
import { filterFeedbacksForDevice } from './feedback-support'

/**
 * Feedbacks aggregator.
 * Builds every feedback, then keeps the ones whose get command this device supports.
 */
export function setupFeedbacks(context: CltProcessorType): CompanionFeedbackDefinitions {
  logger.info('Feedbacks setup start.')

  const built: CompanionFeedbackDefinitions = {
    [FEEDBACK_ID.FREEZE_SCREEN]: setupFreezeScreenFeedback(context),
    [FEEDBACK_ID.BLACKOUT]: setupBlackoutFeedback(context),
    [FEEDBACK_ID.LOW_GRAY]: setupLowGrayFeedback(context)
  }
  const feedbacks = filterFeedbacksForDevice(built, {
    protocol: context.state.protocol,
    modelByte: context.state.modelByte
  })

  logger.info(`Feedbacks setup completed. (${Object.keys(feedbacks).length} feedbacks registered)`)
  return feedbacks
}

export { filterFeedbacksForDevice } from './feedback-support'
