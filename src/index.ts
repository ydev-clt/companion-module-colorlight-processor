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
import { setupStringFeedbacks } from './actions/string-protocol/feedbacks'
import { getProtocolForDeviceType, type ProbeResult } from './udp-probe'

class CltProcessor extends InstanceBase<DeviceConfig> implements ProcessorBase {
  // device config
  public config: DeviceConfig
  // connection instance
  public connection: Connection
  // string-protocol supplementary layer
  public spTransmitter: SPTransmitter
  // state cache
  public state: StateCache

  constructor(internal: unknown) {
    super(internal)

    this.config = defaultConfig

    this.connection = new Connection(this)

    const stateContext = {
      triggerFeedbacks: this.checkFeedbacks.bind(this)
    }
    this.state = new StateCache(stateContext)

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
    this.setActionDefinitions(setupActions(this, this.spTransmitter))
  }

  /**
   * init feedbacks
   */
  private initFeedbacks(): void {
    logger.info('Init feedbacks.')
    // After refactoring: feedbacks unified to String-Protocol
    this.setFeedbackDefinitions(setupStringFeedbacks(this))
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
   * If a known model is detected, applies the mapped protocol to this.config
   * in-memory. On null (timeout, send failure, re-entry), keeps the current
   * config.protocol and logs a warn.
   *
   * Note: Connection already calls updateStatus(Ok) on success before this
   * callback runs. On null, Connection makes no updateStatus call — the
   * status remains Connecting.
   */
  private _onProbeResult(result: ProbeResult | null, host: string): void {
    if (result) {
      this._applyDetectedProtocol(result.deviceType, host)
    } else {
      logger.warn(`UDP probe returned no result (host=${host}); keeping current protocol`)
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
   * Look up the model byte; if a mapping exists and
   * differs from the current protocol, update config and re-register
   * actions and feedbacks (String-Protocol).
   *
   * SpSession rebinding is left to the caller (`_onProbeResult`) so that
   * success and timeout paths converge on a single bind site.
   */
  private _applyDetectedProtocol(deviceType: 0 | 1 | 2, host: string): void {
    const mapped = getProtocolForDeviceType(deviceType)
    if (!mapped) {
      logger.warn(`Unknown device type ${deviceType} (host=${host}); keeping protocol=${this.config.protocol}`)
      return
    }
    if (mapped === this.config.protocol) {
      logger.info(`Probe confirms current protocol: ${mapped} (host=${host})`)
      return
    }
    logger.info(
      `Probe detected protocol change: ${this.config.protocol} → ${mapped} (deviceType=${deviceType}, host=${host})`
    )
    this.config.protocol = mapped
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
