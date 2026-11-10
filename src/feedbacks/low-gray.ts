import type { CompanionAdvancedFeedbackDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { CltProcessorType } from '../common/types'
import { enableButtonStyle, readScreenGroupValue, screenGroupField } from './screen-group'

/**
 * Low gray feedback.
 * Reads sg_<gid>_low_gray_enable and returns the on colors for 1 or '1'.
 */
export function setupLowGrayFeedback(context: CltProcessorType): CompanionAdvancedFeedbackDefinition {
  const ColorWhite = combineRgb(255, 255, 255)
  const ColorBlack = combineRgb(0, 0, 0)
  const ColorDim = combineRgb(70, 70, 70)

  return {
    type: 'advanced',
    name: 'Low-Brightness High-Gray Status',
    description: 'If low-brightness high-gray status changes, change the style of the button',
    options: [
      { type: 'colorpicker', label: 'Foreground color (enable)', id: 'fg', default: ColorWhite },
      { type: 'colorpicker', label: 'Background color (enable)', id: 'bg', default: ColorDim },
      { type: 'colorpicker', label: 'Foreground color (disable)', id: 'fg_', default: ColorWhite },
      { type: 'colorpicker', label: 'Background color (disable)', id: 'bg_', default: ColorBlack },
      screenGroupField()
    ],
    callback: (feedback) =>
      enableButtonStyle(readScreenGroupValue(context, 'low_gray_enable', feedback.options.gid), feedback.options)
  }
}
