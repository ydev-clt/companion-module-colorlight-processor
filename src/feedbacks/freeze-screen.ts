import type { CompanionAdvancedFeedbackDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import { VARIABLE_ID } from '../variables/core/ids'

/**
 * Freeze screen feedback.
 */
export function setupFreezeScreenFeedback(): CompanionAdvancedFeedbackDefinition {
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
    callback: async (feedback, ctx) => {
      // const freezeStatus = context.getVariableValue(VARIABLE_ID.FREEZE_ENABLE)
      const freeze = await ctx.parseVariablesInString(`$(colorlight:${VARIABLE_ID.FREEZE_ENABLE})`)
      if (freeze === '1') {
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
