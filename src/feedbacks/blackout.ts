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
 * String-Protocol blackout feedback.
 */
export function setupBlackoutFeedback(context: CltProcessorType): CompanionAdvancedFeedbackDefinition {
  const ColorWhite = combineRgb(255, 255, 255)
  const ColorBlack = combineRgb(0, 0, 0)
  const ColorBlue = combineRgb(0, 120, 200)

  return {
    type: 'advanced',
    name: 'Screen Blackout Status',
    description: 'If Blackout status change, change the style of the button',
    options: [
      { type: 'colorpicker', label: 'Foreground (Black)', id: 'fg', default: ColorWhite },
      { type: 'colorpicker', label: 'Background (Black)', id: 'bg', default: ColorBlack },
      { type: 'colorpicker', label: 'Foreground (Normal)', id: 'fg_', default: ColorWhite },
      { type: 'colorpicker', label: 'Background (Normal)', id: 'bg_', default: ColorBlue },
      { type: 'number', label: 'Screen group ID (gid)', id: 'gid', min: 1, max: 128, default: 1 }
    ],
    callback: (feedback) => {
      const blackout = context.getVariableValue(publishVariableId('screen-group', 'blackout_enable', screenGroupId(feedback.options.gid)))
      if (blackout === 1 || blackout === '1') {
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
