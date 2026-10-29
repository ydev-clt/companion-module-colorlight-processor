import type { SomeCompanionConfigField } from '@companion-module/base'
import type { ProcessorBase, DeviceConfig, ModuleTypes } from './types'
import type { SPTransmitterHost } from './actions/string-protocol/core/transmitter'
import { InstanceBase } from '@companion-module/base'
import { defaultConfig, generateConfigFields } from './config'
import { DeviceProtocolEnum } from './types'
import { Connection } from './connection'
import { StateCache } from './state'
import { setupLogger, logger } from './log'
import { setupActions } from './actions'
import { SPTransmitter } from './actions/string-protocol/core/transmitter'
import { runInitialPoll } from './variables/initial'
import { setupFeedbacks } from './feedbacks'
import { setupVariables } from './variables'
import { getScreenGroupIds } from './variables/screen-groups'
import { getProtocolForDeviceType, type ProbeResult } from './udp-probe'
import { downlinkChecksumForFamily, resolveDeviceModel } from './device-models'

class CltProcessor extends InstanceBase<ModuleTypes> implements ProcessorBase {
  // device config
  public config: DeviceConfig
  // connection instance
  public connection: Connection
  // string-protocol supplementary layer
  public spTransmitter: SPTransmitter
  private _linkGeneration = 0
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
   * pipeline: UDP probe, then TCP open, plus probe callback registration and
   * actions / feedbacks registration. Previously the `isFirstInit=true` branch only
   * assigned `this.config` and skipped everything else, which meant UDP
   * never opened on first init and the UDP probe never fired.
   */
  public async init(config: DeviceConfig, _isFirstInit: boolean, _secrets: undefined): Promise<void> {
    logger.info('Init connection instance.')
    config.protocol = DeviceProtocolEnum.None

    await this.configUpdated(config, undefined)
  }

  /**
   * destroy connection instance
   */
  public async destroy(): Promise<void> {
    this._linkGeneration++
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
    this.setFeedbackDefinitions(setupFeedbacks(this))
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
  public async configUpdated(config: DeviceConfig, _secrets: undefined): Promise<void> {
    this._linkGeneration++
    this.config = config

    logger.info(`Config updated. protocol=${this.config.protocol}`)

    // Probe success binds SpSession. Link loss clears identity and reconnects.
    this.connection.setOnProbeResult((result) => {
      const host = this.config.host
      this._onProbeResult(result, host)
    })
    this.connection.setOnLinkLost(() => {
      logger.warn('Link lost.')
      this.failLink()
    })

    // Re-instantiate SPTransmitter (when protocol switches)
    this.spTransmitter.destroy()
    this.spTransmitter = new SPTransmitter({})

    // Inject the host required by SPTransmitter
    const transmitterHost: SPTransmitterHost = {
      send: async (bin: Buffer) => {
        // Binary converted by SPTransmitter via SpSession is sent directly over TCP
        return this.send(bin)
      }
    }
    this.spTransmitter.init(transmitterHost)

    if (this.config.host) {
      this.connection.open(this.config.host, this.config.port)
    } else {
      logger.error('Host config is empty.')
      this.connection.close()
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

  private _onProbeResult(result: ProbeResult | null, host: string): void {
    if (result) {
      this._applyDetectedIdentity(result, host)
      this._bindSpSessionFromConfig(this._linkGeneration)
      return
    }
    this._clearDetectedIdentity(host)
  }

  private _clearDetectedIdentity(host: string): void {
    logger.warn(`Probe lost device (host=${host}); clearing identity`)
    this.config.protocol = DeviceProtocolEnum.None
    this.state.modelByte = null
    this.refreshVariableDefinitions()
    this.initActions()
    this.initFeedbacks()
    this.spTransmitter.releaseSpSession()
  }

  private _bindSpSessionFromConfig(generation: number): void {
    if (this.config.protocol === DeviceProtocolEnum.None) return
    const proto = this.config.protocol === DeviceProtocolEnum.A ? 1 : 2
    const model = resolveDeviceModel(this.config.protocol, this.state.modelByte)
    const downlinkChecksum = downlinkChecksumForFamily(model?.family)
    this.spTransmitter
      .bindSpSession(proto, { downlinkChecksum })
      .then(() => {
        if (generation !== this._linkGeneration) return
        this.connection.beginReceiving()
        this.spTransmitter.startHeartbeat(() => {
          logger.warn('Heartbeat lost.')
          this.failLink()
        })
        this._startInitialPoll(generation)
      })
      .catch((err: Error) => {
        if (generation !== this._linkGeneration) return
        logger.error(`bindSpSession failed: ${err.message ?? String(err)}`)
        this.failLink()
      })
  }

  /** Poll initial device state once the session can send commands. A failed get does not drop the link. */
  private _startInitialPoll(generation: number): void {
    void runInitialPoll({
      identity: { protocol: this.config.protocol, modelByte: this.state.modelByte },
      groupIds: getScreenGroupIds(),
      isCurrent: () => generation === this._linkGeneration,
      send: (request) => this.spTransmitter.sendAndAwait(request.cmd, 'get', request.sid, request.data),
      write: this.writebackVariableValues,
      log: (message) => logger.warn(message)
    }).catch((err: Error) => {
      logger.error(`initial poll failed: ${err.message ?? String(err)}`)
    })
  }

  /** Probe already succeeded. Clear identity once and keep a single reconnect timer. */
  private failLink(): void {
    this._linkGeneration++
    this.spTransmitter.stopHeartbeat()
    this._clearDetectedIdentity(this.config.host)
    this.connection.reconnect()
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

export = CltProcessor
