import type { CompanionVariableDefinition } from '@companion-module/base'
import type { CltProcessorType } from '../common/types'
import { logger } from '../common/log'
import { FEEDBACK_ID } from '../common/feedback-ids'
import { isCmdOpSupported, type DeviceIdentity } from '../common/cmd-support'
import { POLL_CATALOG } from './initial'
import { getSpecsByCmd } from './core/registry'
import { getScreenGroupIds } from './screen-groups'
import { publishVariableId } from './publish'

/**
 * String-Protocol variables aggregator.
 *
 * Responsibilities:
 *  - Build variable definitions from the initial poll catalog, filtered
 *    by get-side command support. Screen-group cmds publish one id per
 *    group; device cmds publish the leaf once. Companion only renders
 *    variables the current device can actually populate.
 *  - Install a `setVariableValues` hook that get-actions call to write
 *    values back; this is the single dispatch point so we can extend later
 *    (logging / change detection) without touching every callback.
 */

const FREEZE_ENABLE_KEY = /^sg_\d+_freeze_enable$/
const BLACKOUT_ENABLE_KEY = /^sg_\d+_blackout_enable$/

/**
 * Build the published variable-definition map for a device and screen-group
 * set. A definition exists only for an initial catalog entry whose get side
 * is supported.
 */
export function listPublishedVariables(
  device: DeviceIdentity,
  groupIds: readonly number[]
): Record<string, { name: string }> {
  const out: Record<string, { name: string }> = {}
  for (const entry of POLL_CATALOG) {
    if (entry.phase !== 'initial') continue
    if (!isCmdOpSupported(entry.cmd, 'get', device)) continue
    for (const spec of getSpecsByCmd(entry.cmd)) {
      if (entry.scope === 'screen-group') {
        for (const gid of groupIds) {
          out[publishVariableId('screen-group', spec.variableId, gid)] = { name: spec.displayName }
        }
      } else {
        out[publishVariableId('device', spec.variableId)] = { name: spec.displayName }
      }
    }
  }
  return out
}

/**
 * Module-style installer: takes the InstanceBase (ProcessorBase subset)
 * and wires `setVariableDefinitions` for the supported subset. Returns a
 * stable `setVariableValues` function that get-actions can call to write
 * back values.
 *
 * Re-call this whenever the device identity changes (probe confirms a new
 * model, or the user re-configures the host) to refresh the definition set.
 */
export function setupVariables(context: CltProcessorType): {
  setVariableValues: (values: Record<string, number | string | boolean | object>) => void
  refresh: () => void
} {
  // Lazy bind to InstanceBase methods: the ProcessorBase type doesn't expose
  // setVariableDefinitions/setVariableValues directly, but the InstanceBase
  // runtime does. We cast through `unknown` to avoid widening the public
  // surface (these are Companion Module API methods, not application state).
  const ib = context as unknown as {
    setVariableDefinitions: (defs: Record<string, CompanionVariableDefinition>) => void
    setVariableValues: (values: Record<string, string | number | boolean | object>) => void
  }

  function applyDefinitions(): void {
    const defs = listPublishedVariables(
      {
        protocol: context.config.protocol,
        modelByte: context.state.modelByte
      },
      getScreenGroupIds()
    )
    try {
      ib.setVariableDefinitions(defs)
      logger.info(
        `Variables registered: ${Object.keys(defs).length} (modelByte=${context.state.modelByte ?? 'unresolved'})`
      )
    } catch (err) {
      logger.error(`setVariableDefinitions failed: ${(err as Error).message ?? String(err)}`)
    }
  }

  function setVariableValues(values: Record<string, number | string | boolean | object>): void {
    // Composite variables (e.g. `layer: {layer, x, y, width, height}`) are JSON
    // objects. CompanionVariableValue accepts JsonValue, including objects.
    try {
      ib.setVariableValues(values)
    } catch (err) {
      logger.warn(`setVariableValues failed: ${(err as Error).message ?? String(err)}`)
    }
    const keys = Object.keys(values)
    // Freeze and blackout feedbacks read these variables. Refresh the button
    // style when a poll or get writes the enable flag.
    if (keys.some((key) => FREEZE_ENABLE_KEY.test(key))) {
      context.checkFeedbacks(FEEDBACK_ID.FREEZE_SCREEN)
    }
    if (keys.some((key) => BLACKOUT_ENABLE_KEY.test(key))) {
      context.checkFeedbacks(FEEDBACK_ID.BLACKOUT)
    }
  }

  // First install.
  applyDefinitions()

  return {
    setVariableValues,
    refresh: applyDefinitions
  }
}

export { VARIABLE_ID } from './core/ids'
