import type { CompanionAdvancedFeedbackDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { CltProcessorType } from '../common/types'
import { enableButtonStyle, readScreenGroupValue, screenGroupField } from './screen-group'

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
      screenGroupField()
    ],
    callback: (feedback) =>
      enableButtonStyle(readScreenGroupValue(context, 'blackout_enable', feedback.options.gid), feedback.options)
  }
}
