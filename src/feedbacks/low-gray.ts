import type { CompanionAdvancedFeedbackDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { CltProcessorType } from '../common/types'
import { publishVariableId } from '../variables/publish'

/** V/VX publishes low_gray on screen group 2 only. */
const LOW_GRAY_SCREEN_GROUP = 2

/**
 * Low gray feedback.
 * Reads sg_2_low_gray_enable and returns the on colors for 1 or '1'.
 */
export function setupLowGrayFeedback(context: CltProcessorType): CompanionAdvancedFeedbackDefinition {
  const ColorWhite = combineRgb(255, 255, 255)
  const ColorAmber = combineRgb(180, 120, 0)
  const ColorDim = combineRgb(70, 70, 70)

  return {
    type: 'advanced',
    name: 'Low Gray Status',
    description: 'If low gray status changes, change the style of the button',
    options: [
      { type: 'colorpicker', label: 'Foreground color (Low gray)', id: 'fg', default: ColorWhite },
      { type: 'colorpicker', label: 'Background color (Low gray)', id: 'bg', default: ColorAmber },
      { type: 'colorpicker', label: 'Foreground color (Normal)', id: 'fg_', default: ColorWhite },
      { type: 'colorpicker', label: 'Background color (Normal)', id: 'bg_', default: ColorDim }
    ],
    callback: (feedback) => {
      const enabled = context.getVariableValue(
        publishVariableId('screen-group', 'low_gray_enable', LOW_GRAY_SCREEN_GROUP)
      )
      // A poll writes a number. Companion can surface the same variable as a string.
      if (enabled === 1 || enabled === '1') {
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
