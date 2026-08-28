import type { SomeCompanionConfigField } from '@companion-module/base'
import type { DeviceConfig } from './types'
import { Regex } from '@companion-module/base'
import { DeviceProtocolEnum } from './types'

/**
 * default config
 */
export const defaultConfig: DeviceConfig = {
  host: '192.168.1.10',
  port: 9099,
  protocol: DeviceProtocolEnum.None
}

/**
 * Generate config fields
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
    },
    {
      type: 'dropdown',
      id: 'protocol',
      label: 'Device Type',
      width: 6,
      choices: [
        {
          id: DeviceProtocolEnum.A,
          label: 'A-Protocol Device'
        },
        {
          id: DeviceProtocolEnum.B,
          label: 'B-Protocol Device'
        },
        {
          id: DeviceProtocolEnum.None,
          label: 'None'
        }
      ],
      isVisible: () => false,
      default: DeviceProtocolEnum.None
    }
  ]
}
