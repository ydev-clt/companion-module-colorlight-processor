import type { SomeCompanionConfigField } from '@companion-module/base'
import type { DeviceConfig } from './common/types'
import { Regex } from '@companion-module/base'

/**
 * Default config. The protocol is not user config: the UDP probe decides it
 * and the module stores it in StateCache.
 */
export const defaultConfig: DeviceConfig = {
  host: '192.168.1.10',
  port: 9999
}

export interface NormalizedConfig {
  config: DeviceConfig
  error?: string
}

/**
 * Normalize the saved config to the shape the connection layer needs.
 * Companion stores the port as a text field, so a numeric string is accepted;
 * anything outside 1–65535 is reported and the caller must not open the socket.
 */
export function normalizeConfig(input: unknown): NormalizedConfig {
  const record = (input ?? {}) as { host?: unknown; port?: unknown }
  const host = typeof record.host === 'string' ? record.host.trim() : ''
  const rawPort = Number(record.port)
  const validPort = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535
  const port = validPort ? rawPort : defaultConfig.port

  if (!host) return { config: { host, port }, error: 'Host config is empty.' }
  if (!validPort) return { config: { host, port }, error: `Invalid TCP port: ${String(record.port)}` }
  return { config: { host, port } }
}

/**
 * Generate config fields. Device Type is intentionally absent: it is
 * discovered from the probe and exposed through StateCache.
 */
export function generateConfigFields(): SomeCompanionConfigField[] {
  return [
    {
      type: 'textinput',
      id: 'host',
      label: 'Target IP',
      width: 8,
      regex: Regex.IP
    },
    {
      type: 'textinput',
      id: 'port',
      label: 'Target Port',
      width: 4,
      regex: Regex.PORT
    }
  ]
}
