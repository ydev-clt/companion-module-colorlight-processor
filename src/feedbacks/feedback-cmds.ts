import { FEEDBACK_ID } from '../common/feedback-ids'

/**
 * Maps each feedback to the protocol command used for get-support checks.
 * `'always'` stays registered on every device, including an unresolved model.
 * A missing entry is not registered.
 */
export const FEEDBACK_CMD: Record<FEEDBACK_ID, string | 'always'> = {
  [FEEDBACK_ID.FREEZE_SCREEN]: 'freeze',
  [FEEDBACK_ID.BLACKOUT]: 'blackout',
  [FEEDBACK_ID.LOW_GRAY]: 'low_gray'
}
