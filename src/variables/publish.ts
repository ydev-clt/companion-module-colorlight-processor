export type VariableScope = 'screen-group' | 'device'

export function publishVariableId(scope: VariableScope, leaf: string, gid?: number): string {
  if (scope === 'device') return leaf
  return `sg_${gid}_${leaf}`
}
