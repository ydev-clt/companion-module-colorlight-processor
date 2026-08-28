import type { InstanceBase } from '@companion-module/base'
import type { StateCache } from './state'

export enum DeviceProtocolEnum {
  A = 'A-Protocol',
  B = 'B-Protocol',
  None = 'None'
}

/**
 * device config
 */
export type DeviceConfig = {
  host: string
  port: number
  protocol: DeviceProtocolEnum
}

/**
 * base processor
 */
export interface ProcessorBase {
  config: DeviceConfig
  state: StateCache
  send(data: Buffer): Promise<boolean>
}

/**
 * action context
 */
export type ActionContext = ProcessorBase

/**
 * feedback context
 */
export type FeedbackContext = ProcessorBase

/**
 * state context
 */
export type StateContext = {
  triggerFeedbacks(...ids: string[]): void
}

/**
 * connection context
 *
 * `handleIncoming` is the downlink byte entry point for String-Protocol:
 *  - Called by the socket `data` event callback of `Connection`
 *  - Internally determines the protocol and dispatches to SPTransmitter
 *    for frame parsing and response routing
 */
export type ConnectionContext = {
  config: DeviceConfig
  handleIncoming(data: Buffer): void
} & Pick<InstanceBase<DeviceConfig>, 'updateStatus'>
