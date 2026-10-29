import type { CompanionAdvancedFeedbackDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { CltProcessorType } from '../types'
import { publishVariableId } from '../variables/publish'

function screenGroupId(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 128) {
    return value
  }
  return 1
}

/**
 * Freeze screen feedback.
 */
export function setupFreezeScreenFeedback(context: CltProcessorType): CompanionAdvancedFeedbackDefinition {
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
      { type: 'colorpicker', label: 'Background color (unFreeze)', id: 'bg_', default: ColorGreen },
      { type: 'number', label: 'Screen group ID (gid)', id: 'gid', min: 1, max: 128, default: 1 }
    ],
    callback: (feedback) => {
      const freeze = context.getVariableValue(publishVariableId('screen-group', 'freeze_enable', screenGroupId(feedback.options.gid)))
      if (freeze === 1 || freeze === '1') {
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
