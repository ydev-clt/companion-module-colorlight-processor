import type { SomeCompanionConfigField } from '@companion-module/base'
import type { ProcessorBase, DeviceConfig } from './types'
import type { SPTransmitterHost } from './actions/string-protocol/core/transmitter'
import { InstanceBase, runEntrypoint } from '@companion-module/base'
import { defaultConfig, generateConfigFields } from './config'
import { DeviceProtocolEnum } from './types'
import { Connection } from './connection'
import { StateCache } from './state'
import { setupLogger, logger } from './log'
import { setupActions } from './actions'
import { SPTransmitter } from './actions/string-protocol/core/transmitter'
import { setupFeedbacks } from './feedbacks'
import { setupVariables } from './variables'
import { getProtocolForDeviceType, type ProbeResult } from './udp-probe'
import { resolveDeviceModel } from './device-models'

class CltProcessor extends InstanceBase<DeviceConfig> implements ProcessorBase {
  // device config
  public config: DeviceConfig
  // connection instance
  public connection: Connection
  // string-protocol supplementary layer
  public spTransmitter: SPTransmitter
  // state cache
  public state: StateCache

  /**
   * Variable writeback hook installed by initVariables().
   * Get-actions call this to update variables after a successful response.
   * Stable across identity changes; only the definition list is rebuilt.
   *
   * Named `writebackVariableValues` to avoid colliding with the public
   * `setVariableValues` method inherited from InstanceBase.
   */
  private writebackVariableValues: (values: Record<string, number | string | object>) => void = () => {
    // Default no-op until initVariables wires the real callback.
  }
  /** Refresh hook installed by initVariables(); rebuilt on identity change. */
  private refreshVariableDefinitions: () => void = () => {}

  constructor(internal: unknown) {
    super(internal)

    this.config = defaultConfig

    this.connection = new Connection(this)

    this.state = new StateCache()

    // string-protocol layer
    this.spTransmitter = new SPTransmitter({})

    // init logger
    setupLogger(this.log.bind(this))
  }

  /**
   * init connection instance
   *
   * Always delegates to `configUpdated` so the first init runs the full
   * pipeline: UDP-open + probe callback registration + actions /
   * feedbacks registration. Previously the `isFirstInit=true` branch only
   * assigned `this.config` and skipped everything else, which meant UDP
   * never opened on first init and the UDP probe never fired.
   */
  public async init(config: DeviceConfig, _isFirstInit: boolean): Promise<void> {
    logger.info('Init connection instance.')
    config.protocol = DeviceProtocolEnum.None

    await this.configUpdated(config)
  }

  /**
   * destroy connection instance
   */
  public async destroy(): Promise<void> {
    this.connection.close()
    this.spTransmitter.destroy()

    logger.info('Destroy connection instance.')
  }

  /**
   * init actions
   */
  private initActions(): void {
    logger.info('Init actions.')
    // After refactoring: actions unified to String-Protocol
    this.setActionDefinitions(setupActions(this, this.spTransmitter, this.writebackVariableValues))
  }

  /**
   * init feedbacks
   */
  private initFeedbacks(): void {
    logger.info('Init feedbacks.')
    // After refactoring: feedbacks unified to String-Protocol
    this.setFeedbackDefinitions(setupFeedbacks())
  }

  /**
   * init variables
   *
   * Registers Companion variables for all supported cmds and installs the
   * writeback hook that get-actions use. Re-called on identity change.
   */
  private initVariables(): void {
    logger.info('Init variables.')
    const { setVariableValues, refresh } = setupVariables(this)
    this.writebackVariableValues = setVariableValues
    this.refreshVariableDefinitions = refresh
  }

  /**
   * config updated
   */
  public async configUpdated(config: DeviceConfig): Promise<void> {
    this.config = config

    logger.info(`Config updated. protocol=${this.config.protocol}`)

    // Probe result (success or null/timeout) → fire _onProbeResult.
    // The probe fires on every connection.open(); status flips to Ok on
    // first valid 0xEA, stays Connecting on timeout (see Connection).
    this.connection.setOnProbeResult((result) => {
      const host = this.config.host
      this._onProbeResult(result, host)
    })

    // Re-instantiate SPTransmitter (when protocol switches)
    this.spTransmitter.destroy()
    this.spTransmitter = new SPTransmitter({})

    // Inject the host required by SPTransmitter
    const transmitterHost: SPTransmitterHost = {
      send: async (bin: Buffer) => {
        // Binary converted by SPTransmitter via SpSession is sent directly over UDP
        return this.send(bin)
      }
    }
    this.spTransmitter.init(transmitterHost)

    if (this.config.host) {
      this.connection.open(this.config.host, this.config.port)
    } else {
      logger.error('Host config is empty.')
    }

    // Variables first so the writeback hook is wired before any get-action
    // can possibly fire (the probe callback may run synchronously before the
    // user can press a button, but a defensive ordering avoids a window where
    // get-actions would no-op silently).
    this.initVariables()
    this.initActions()
    this.initFeedbacks()
  }

  /**
   * get config fields
   */
  public getConfigFields(): SomeCompanionConfigField[] {
    return generateConfigFields()
  }

  /**
   * trigger feedbacks by id
   */
  public triggerFeedback(id: string): void {
    this.checkFeedbacksById(id)
  }

  /**
   * Fired by Connection when the 0xEB probe resolves (success or null/timeout).
   * On success, applies the detected device identity (protocol + model byte)
   * to config/state in-memory. On null (timeout, send failure, re-entry),
   * keeps the current identity and logs a warn.
   *
   * Note: Connection already calls updateStatus(Ok) on success before this
   * callback runs. On null, Connection makes no updateStatus call — the
   * status remains Connecting.
   */
  private _onProbeResult(result: ProbeResult | null, host: string): void {
    if (result) {
      this._applyDetectedIdentity(result, host)
    } else {
      logger.warn(`UDP probe returned no result (host=${host}); keeping current identity`)
    }

    // After probe completes (or probe fails), bind SpSession based on current config.protocol
    this._bindSpSessionFromConfig()
  }

  /**
   * Bind SpSession based on this.config.protocol.
   *  - PROTO_A=1 → A-Protocol
   *  - PROTO_B=2 → B-Protocol
   *
   * Async: the underlying WASM first instantiation is async. The caller is
   * a synchronous callback from `setOnProbeResult` (Connection side only has
   * synchronous events like on('data')), so this uses fire-and-forget:
   * the promise is put into `_bindInflight` with a `.catch()` fallback.
   * Protocol switching + probe occurring simultaneously will not race.
   */
  private _bindSpSessionFromConfig(): void {
    if (this.config.protocol === DeviceProtocolEnum.None) return
    const proto = this.config.protocol === DeviceProtocolEnum.A ? 1 : 2
    const inflight = this.spTransmitter.bindSpSession(proto)
    inflight.catch((err: Error) => {
      logger.error(`bindSpSession failed: ${err.message ?? String(err)}`)
    })
  }

  /**
   * Apply the probe-detected device identity (protocol + model byte).
   *  - protocol → `this.config.protocol` (in-memory, existing behavior)
   *  - modelByte → `this.state.modelByte` (runtime state, not config:
   *    config expresses user intent, state expresses measured identity)
   * Re-registers actions and feedbacks when either component changes.
   *
   * SpSession rebinding is left to the caller (`_onProbeResult`) so that
   * success and timeout paths converge on a single bind site.
   */
  private _applyDetectedIdentity(result: ProbeResult, host: string): void {
    const mapped = getProtocolForDeviceType(result.deviceType)
    if (!mapped) {
      logger.warn(
        `Unknown device type ${result.deviceType} (host=${host}); keeping identity (protocol=${this.config.protocol})`
      )
      return
    }

    const modelByte = result.model
    const model = resolveDeviceModel(mapped, modelByte)
    const modelDesc = model
      ? `${model.label}${model.family !== undefined ? ` (family=${model.family})` : ''}`
      : `unresolved (modelByte=${modelByte})`

    if (mapped === this.config.protocol && modelByte === this.state.modelByte) {
      logger.info(`Probe confirms identity: protocol=${mapped}, ${modelDesc}`)
      return
    }

    logger.info(
      `Probe detected identity change: protocol ${this.config.protocol} → ${mapped}, ` +
        `modelByte ${this.state.modelByte} → ${modelByte} (${modelDesc}) (deviceType=${result.deviceType}, host=${host})`
    )
    this.config.protocol = mapped
    this.state.modelByte = modelByte
    // Variables must refresh *before* actions so any user-triggered get on
    // the new identity doesn't reference stale definitions.
    this.refreshVariableDefinitions()
    this.initActions()
    // Feedback unified to String-Protocol
    this.initFeedbacks()
  }

  /**
   * send data
   */
  public async send(data: Buffer): Promise<boolean> {
    return this.connection.send(data)
  }

  /**
   * handle incoming UDP data (String-Protocol route)
   */
  public handleIncoming(data: Buffer): void {
    // After refactoring: unified through SPTransmitter (SpSession internally
    // strips <...> and parses JSON)
    this.spTransmitter.handleIncoming(data)
  }
}

runEntrypoint(CltProcessor, [])
