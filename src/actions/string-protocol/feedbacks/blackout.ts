import type { CompanionAdvancedFeedbackDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { FeedbackContext } from '../../../types'

/**
 * String-Protocol blackout feedback.
 */
export function setupStringBlackoutFeedback(context: FeedbackContext): CompanionAdvancedFeedbackDefinition {
  const ColorWhite = combineRgb(255, 255, 255)
  const ColorBlack = combineRgb(0, 0, 0)
  const ColorBlue = combineRgb(0, 120, 200)

  return {
    type: 'advanced',
    name: 'Screen Blackout Status (String-Protocol)',
    description: 'If Blackout status change, change the style of the button',
    options: [
      { type: 'colorpicker', label: 'Foreground (Black)', id: 'fg', default: ColorWhite },
      { type: 'colorpicker', label: 'Background (Black)', id: 'bg', default: ColorBlack },
      { type: 'colorpicker', label: 'Foreground (Normal)', id: 'fg_', default: ColorWhite },
      { type: 'colorpicker', label: 'Background (Normal)', id: 'bg_', default: ColorBlue }
    ],
    callback: (feedback) => {
      if (context.state.isBlackScreen) {
        return {
          bgcolor: feedback.options.bg as number,
          color: feedback.options.fg as number
        }
      }
      return {
        bgcolor: feedback.options.bg_ as number,
        color: feedback.options.fg_ as number
      }
    }
  }
}
