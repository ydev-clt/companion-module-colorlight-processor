import type { CompanionActionDefinition, CompanionActionDefinitions } from '@companion-module/base'
import { ACTION_ID } from '../core/ids'
import { CMD } from '../core/constants'
import { buildGetAction, deviceAndBroadcastFields } from './_shared'
import type { StringActionHost } from './_shared'

/**
 * Query-only actions:
 *  - heartbeat       (§5.1)              Connection heartbeat ping (does not write variables)
 *  - cmdlist         (§5.1)              List supported cmds from device (no vars)
 *  - sndinfo         (§5.2.6 / §5.3.1)   Sender card info
 *  - snd_eth         (§5.3.2)            Sender Ethernet ports
 *  - pr_layer        (§5.3.3)            Screen layer count
 *  - pr_group        (§5.3.4)            Screen group count + ids
 *  - pr_video        (§5.3.5)            Video input signals
 *  - pr_vsync        (§5.3.6)            VSYNC info
 *  - port_area       (§5.3.7)            Port control area
 *  - pr_video_count  (§5.3.8)            Video input count
 *  - mfc_probe       (§5.3.9)            Multi-function card info
 *  - rcv_probe       (§5.3.10)           Receiver card info
 *  - mod_probe       (§5.3.11)           Module info
 *  - pr_rcv_state    (§5.3.12)           Receiver module state
 *
 * Variables: each <cmd>_get action writes its known response fields into
 * variables on success (code=0). Pre-aggregation order keeps file
 * structure parallel to setupProbeActions callers.
 */
export function setupProbeActions(host: StringActionHost): CompanionActionDefinitions {
  const actions: Record<string, CompanionActionDefinition> = {}

  // ---- heartbeat (no variable write; action used to keep connection alive / round-trip test) ----
  actions[ACTION_ID.HEARTBEAT] = {
    name: 'Send Heartbeat',
    description:
      'Send a heartbeat ping (cmd=heartbeat, op=set). The response code is logged but not surfaced as a variable.',
    options: [...deviceAndBroadcastFields()],
    callback: async (event) => {
      const o = event.options as { deviceId: number; isSelectAll: boolean }
      const sid = (o.isSelectAll ? 255 : Number(o.deviceId) || 1) as number
      // Heartbeat is fire-and-forget (no response expected); we still go through
      // sendOnly rather than sendAndAwait because the device never replies.
      await host.conn.sendOnly(CMD.HEARTBEAT, 'set', sid, {})
    }
  }

  // ---- cmdlist (no variable write; used to verify which cmds the device supports) ----
  actions[ACTION_ID.CMDLIST] = buildGetAction(host, {
    name: 'Get Supported Command List',
    description: 'Query the device supported command list (cmd=cmdlist, op=get).',
    cmd: CMD.CMDLIST,
    skipGid: true
  })

  // ---- sndinfo ----
  actions[ACTION_ID.SNDINFO_GET] = buildGetAction(host, {
    name: 'Get Sender Info',
    description:
      'Query sender card information. Writes the full snapshot to the `sender_info` variable as a single object: `{ model, version, brightness, color_temp, temperature, blackout, freeze, test_pattern, ports }`.',
    cmd: CMD.SNDINFO,
    skipGid: true
  })

  // ---- snd_eth ----
  actions[ACTION_ID.SND_ETH_GET] = buildGetAction(host, {
    name: 'Get Sender Ethernet Ports',
    description:
      'Query sender Ethernet port information. Writes the result to the `sender_ethernet` variable as a single object: `{ count, ports }`.',
    cmd: CMD.SND_ETH,
    skipGid: true
  })

  // ---- pr_layer ----
  actions[ACTION_ID.PR_LAYER_GET] = buildGetAction(host, {
    name: 'Get Screen Layer Count',
    description:
      'Query the screen layer count. Writes the result to the `screen_layer_count` variable as a single object: `{ gid, layer_count }`.',
    cmd: CMD.PR_LAYER
  })

  // ---- pr_group ----
  actions[ACTION_ID.PR_GROUP_GET] = buildGetAction(host, {
    name: 'Get Screen Group Count',
    description:
      'Query the screen group count. Writes the result to the `screen_group_count` variable as a single object: `{ count, ids }`.',
    cmd: CMD.PR_GROUP,
    skipGid: true
  })

  // ---- pr_video ----
  actions[ACTION_ID.PR_VIDEO_GET] = buildGetAction<{
    deviceId: number
    isSelectAll?: boolean
    slotCode: number
    boardKind: number
  }>(host, {
    name: 'Get Video Input Signals',
    description:
      'Query the active video input signals at a specific slot / board kind. Writes the result to the `video_board` variable as a single object: `{ total, sources }`.',
    cmd: CMD.PR_VIDEO,
    skipGid: true,
    extraFields: [
      {
        type: 'number',
        label: 'Slot code (0-65535)',
        tooltip: 'Input board slot code; identifies the physical slot (e.g. 16, 4112, 4098).',
        id: 'slotCode',
        min: 0,
        max: 65535,
        default: 16,
        required: true
      },
      {
        type: 'number',
        label: 'Board kind (0-255)',
        tooltip: 'Board type code (e.g. 17, 24, 50).',
        id: 'boardKind',
        min: 0,
        max: 255,
        default: 17,
        required: true
      }
    ],
    dataBuilder: ({ slotCode, boardKind }) => ({ slotCode, boardKind })
  })

  // ---- pr_vsync ----
  actions[ACTION_ID.PR_VSYNC_GET] = buildGetAction(host, {
    name: 'Get VSYNC Info',
    description:
      'Query VSYNC info. Writes the result to the `vsync_info` variable as a single object: `{ gid, scaled100, scaled10000 }`.',
    cmd: CMD.PR_VSYNC
  })

  // ---- port_area ----
  actions[ACTION_ID.PORT_AREA_GET] = buildGetAction(host, {
    name: 'Get Port Control Area',
    description:
      'Query the port control area. Writes the result to the `port_control_area` variable as a single object: `{ gid, port_count, ports, xs, ys, ws, hs }`.',
    cmd: CMD.PORT_AREA
  })

  // ---- pr_video_count ----
  actions[ACTION_ID.PR_VIDEO_COUNT_GET] = buildGetAction(host, {
    name: 'Get Video Input Count',
    description: 'Query the number of video inputs. Writes to the `pr_video_count` variable.',
    cmd: CMD.PR_VIDEO_COUNT,
    skipGid: true
  })

  // ---- mfc_probe ----
  actions[ACTION_ID.MFC_PROBE_GET] = buildGetAction<{ deviceId: number; isSelectAll?: boolean; port: number }>(host, {
    name: 'Probe Multi-Function Card',
    description:
      'Query the multi-function card. Writes the result to the `multi_function_card` variable as a single object: `{ port, card_count, temperature, hardware_version, software_version }`.',
    cmd: CMD.MFC_PROBE,
    skipGid: true,
    extraFields: [
      {
        type: 'number',
        label: 'Output port index (1-based)',
        id: 'port',
        min: 1,
        max: 64,
        default: 1,
        required: true
      }
    ],
    dataBuilder: ({ port }) => ({ port })
  })

  // ---- rcv_probe ----
  actions[ACTION_ID.RCV_PROBE_GET] = buildGetAction<{
    deviceId: number
    isSelectAll?: boolean
    port: number
    rcv: number
  }>(host, {
    name: 'Probe Receiver Card',
    description:
      'Query the receiver card. Writes the result to the `receiver_card` variable as a single object: `{ port, rcv, card_type, width, height, linked, runtime, version }`.',
    cmd: CMD.RCV_PROBE,
    skipGid: true,
    extraFields: [
      {
        type: 'number',
        label: 'Output port index (1-based)',
        id: 'port',
        min: 1,
        max: 64,
        default: 1,
        required: true
      },
      {
        type: 'number',
        label: 'Receiver card index (1-based)',
        tooltip: 'Receiver card number on the port. Must be >= 1 and must not be 65535.',
        id: 'rcv',
        min: 1,
        max: 65534,
        default: 1,
        required: true
      }
    ],
    dataBuilder: ({ port, rcv }) => ({ port, rcv })
  })

  // ---- mod_probe ----
  actions[ACTION_ID.MOD_PROBE_GET] = buildGetAction<{ deviceId: number; isSelectAll?: boolean; port: number }>(host, {
    name: 'Probe Module',
    description:
      'Query the module. Writes the result to the `module_probe` variable as a single object: `{ port, modules }`.',
    cmd: CMD.MOD_PROBE,
    skipGid: true,
    extraFields: [
      {
        type: 'number',
        label: 'Output port index (1-based)',
        id: 'port',
        min: 1,
        max: 64,
        default: 1,
        required: true
      }
    ],
    dataBuilder: ({ port }) => ({ port })
  })

  // ---- pr_rcv_state ----
  actions[ACTION_ID.PR_RCV_STATE_GET] = buildGetAction<{ deviceId: number; isSelectAll?: boolean; port: number }>(host, {
    name: 'Get Receiver Module State',
    description:
      'Query the receiver module state. Writes the result to the `recv_module_state` variable as a single object: `{ port, modules }`.',
    cmd: CMD.PR_RCV_STATE,
    skipGid: true,
    extraFields: [
      {
        type: 'number',
        label: 'Output port index (1-based)',
        id: 'port',
        min: 1,
        max: 64,
        default: 1,
        required: true
      }
    ],
    dataBuilder: ({ port }) => ({ port })
  })

  return actions as CompanionActionDefinitions
}
