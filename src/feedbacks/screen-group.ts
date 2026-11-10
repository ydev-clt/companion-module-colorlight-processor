import { publishVariableId } from '../variables/publish'

const SCREEN_GROUP_MIN = 1
const SCREEN_GROUP_MAX = 128
const SCREEN_GROUP_DEFAULT = 1

/**
 * Screen group selected on a feedback button.
 * Companion may return the gid option as a non-integer. Those values use screen group 1.
 */
export function screenGroupId(value: unknown): number {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SCREEN_GROUP_MIN &&
    value <= SCREEN_GROUP_MAX
  ) {
    return value
  }
  return SCREEN_GROUP_DEFAULT
}

/**
 * Screen group number field shared by feedbacks that read one group.
 */
export function screenGroupField(): {
  type: 'number'
  label: string
  id: 'gid'
  min: number
  max: number
  default: number
} {
  return {
    type: 'number',
    label: 'Screen group ID (gid)',
    id: 'gid',
    min: SCREEN_GROUP_MIN,
    max: SCREEN_GROUP_MAX,
    default: SCREEN_GROUP_DEFAULT
  }
}

/**
 * Read one screen-group variable for the button's gid.
 */
export function readScreenGroupValue(
  context: { getVariableValue(id: string): unknown },
  leaf: string,
  gid: unknown
): unknown {
  return context.getVariableValue(publishVariableId('screen-group', leaf, screenGroupId(gid)))
}

/**
 * On colors when the enable flag is 1 or '1'.
 * A poll writes a number. Companion can surface the same variable as a string.
 */
export function enableButtonStyle(
  value: unknown,
  options: { bg?: unknown; fg?: unknown; bg_?: unknown; fg_?: unknown }
): { bgcolor: number; color: number } {
  if (value === 1 || value === '1') {
    return {
      bgcolor: options.bg as number,
      color: options.fg as number
    }
  }
  return {
    bgcolor: options.bg_ as number,
    color: options.fg_ as number
  }
}
