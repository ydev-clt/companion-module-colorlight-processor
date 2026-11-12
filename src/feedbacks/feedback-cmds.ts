import { CMD, type Cmd } from '../common/commands'
import { FEEDBACK_ID } from '../common/feedback-ids'

/**
 * Maps each feedback to the protocol command used for get-support checks.
 * `'always'` stays registered on every device, including an unresolved model.
 * A missing entry is not registered.
 */
export const FEEDBACK_CMD: Record<FEEDBACK_ID, Cmd | 'always'> = {
  [FEEDBACK_ID.FREEZE_SCREEN]: CMD.FREEZE,
  [FEEDBACK_ID.BLACKOUT]: CMD.BLACKOUT,
  [FEEDBACK_ID.LOW_GRAY]: CMD.LOW_GRAY
}
