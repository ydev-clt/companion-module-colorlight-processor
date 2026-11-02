export type VariableScope = 'screen-group' | 'device'

/**
 * Companion variable id.
 * Device leaves are published as-is (`sn`).
 * Screen-group leaves are prefixed so each group has its own id (`sg_1_freeze_enable`).
 */
export function publishVariableId(scope: VariableScope, leaf: string, gid?: number): string {
  if (scope === 'device') return leaf
  return `sg_${gid}_${leaf}`
}
