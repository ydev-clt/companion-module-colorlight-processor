import type { CompanionAdvancedFeedbackDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { FeedbackContext } from '../types'

/**
 * Freeze screen feedback.
 */
export function setupFreezeScreenFeedback(context: FeedbackContext): CompanionAdvancedFeedbackDefinition {
  const ColorWhite = combineRgb(255, 255, 255)
  const ColorRed = combineRgb(200, 0, 0)
  const ColorGreen = combineRgb(0, 200, 0)

  return {
    type: 'advanced',
    name: 'Screen Freeze Status',
    description: 'If Freeze status change, change the style of the button',
    options: [
      { type: 'colorpicker', label: 'Foreground color (Freeze)', id: 'fg', default: ColorWhite },
      { type: 'colorpicker', label: 'Background color (Freeze)', id: 'bg', default: ColorRed },
      { type: 'colorpicker', label: 'Foreground color (unFreeze)', id: 'fg_', default: ColorWhite },
      { type: 'colorpicker', label: 'Background color (unFreeze)', id: 'bg_', default: ColorGreen }
    ],
    callback: (feedback) => {
      if (context.state.isFreezeScreen) {
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
