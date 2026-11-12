import type { SomeCompanionConfigField } from '@companion-module/base'
import type { ProcessorBase, DeviceConfig, ModuleTypes } from './common/types'
import type { SPTransmitterHost } from './actions/string-protocol/core/transmitter'
import { InstanceBase } from '@companion-module/base'
import { defaultConfig, generateConfigFields } from './config'
import { DeviceProtocolEnum } from './common/types'
import { Connection } from './connection'
import { StateCache } from './state'
import { setupLogger, logger } from './common/log'
import { setupActions } from './actions'
import { ActionMutex } from './actions/string-protocol/core/action-mutex'
import { SPTransmitter } from './actions/string-protocol/core/transmitter'
import * as initialPoll from './variables/initial'
import { setupFeedbacks } from './feedbacks'
import { setupVariables } from './variables'
import {
  buildScreenGroupPlan,
  groupIdsFromPrGroup,
  managedGroupIds,
  pushedGroupToAdd,
  screenGroupCountValue,
  type ScreenGroupSlot
} from './variables/screen-groups'
import { valuesFromPush } from './variables/push'
import { getProtocolForDeviceType, type ProbeResult } from './udp-probe'
import { downlinkChecksumForFamily, resolveDeviceModel } from './common/device-models'
import { isCmdOpSupported } from './common/cmd-support'
import { discoverInputVideoSources } from './common/input-video-sources'

class CltProcessor extends InstanceBase<ModuleTypes> implements ProcessorBase {
  // device config
  public config: DeviceConfig
  // connection instance
  public connection: Connection
  // string-protocol supplementary layer
  public spTransmitter: SPTransmitter
  /** Bumps on config change, destroy, and link loss so a late bind or poll cannot write the new session. */
  private _linkGeneration = 0
  /**
   * One lock per instance. Re-registering actions on identity or input-source
   * changes must not start a second lock while a callback is running.
   */
  private readonly actionMutex = new ActionMutex()
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
  /**
   * null until `pr_group` or a qualifying push establishes the list.
   * `[]` is a known empty list and still publishes `screen_group_count`.
   */
  private managedGroupIds: number[] | null = null
  /** Slots derived from `managedGroupIds`. Empty while that list is unknown. */
  private screenGroupPlan: ScreenGroupSlot[] = []

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
    this.setActionDefinitions(
      setupActions(this, this.spTransmitter, this.writebackVariableValues, this.actionMutex)
    )
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
    const { setVariableValues, refresh } = setupVariables(this, () => ({
      slots: this.screenGroupPlan,
      groupListKnown: this.managedGroupIds !== null
    }))
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
    this.state.inputVideoSources = []
    // Unknown list: device variables stay, screen-group variables do not.
    this.managedGroupIds = null
    this.screenGroupPlan = []
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
      .then(async () => {
        if (generation !== this._linkGeneration) return
        this.spTransmitter.setOnPush((item) => {
          if (generation !== this._linkGeneration) return
          const cmd = item.cmd
          const code = item.code
          if (typeof cmd !== 'string') return
          if (typeof code === 'number' && code !== 0) {
            logger.warn(`push ${cmd} code=${code} ignored`)
            return
          }
          const identity = { protocol: this.config.protocol, modelByte: this.state.modelByte }
          if (cmd === 'pr_group') {
            // Replace the whole list. An empty or unusable body is ignored so
            // a bad push cannot wipe groups that are already managed.
            const parsed = groupIdsFromPrGroup({ code: typeof code === 'number' ? code : undefined, data: item.data })
            if (parsed.length === 0) return
            this.commitScreenGroups(managedGroupIds(identity, parsed))
            return
          }
          // A command can append one missing gid only when that command belongs
          // on that gid. The pushed leaves are written after the plan updates.
          // Nothing here sends another get for the new group.
          const addGid = pushedGroupToAdd(identity, cmd, item.data, this.managedGroupIds)
          if (addGid !== undefined) {
            this.commitScreenGroups([...(this.managedGroupIds ?? []), addGid])
          }
          const values = valuesFromPush({ cmd, code, data: item.data }, identity, this.screenGroupPlan)
          if (Object.keys(values).length === 0) return
          this.writebackVariableValues(values)
        })
        this.connection.beginReceiving()
        const subscribed = await this.spTransmitter.subscribePush()
        if (!subscribed) {
          logger.warn('comm_obj subscribe was not sent; continuing with heartbeat and initial poll')
        }
        if (generation !== this._linkGeneration) return
        this.spTransmitter.startHeartbeat(
          () => {
            logger.warn('Heartbeat lost.')
            this.failLink()
          },
          (fn) => this.actionMutex.run(fn)
        )
        this._startInitialPoll(generation)
        this._discoverInputVideoSources(generation)
      })
      .catch((err: Error) => {
        if (generation !== this._linkGeneration) return
        logger.error(`bindSpSession failed: ${err.message ?? String(err)}`)
        this.failLink()
      })
  }

  /** Protocol and model byte the plan and support checks read. */
  private deviceIdentity(): { protocol: DeviceProtocolEnum; modelByte: number | null } {
    return { protocol: this.config.protocol, modelByte: this.state.modelByte }
  }

  /**
   * Install `next` as the managed gid list and rebuild the shared plan.
   * Definitions change only when the set of gids changes, so a reorder does
   * not republish them. `screen_group_count` is written either way.
   */
  private commitScreenGroups(next: readonly number[]): void {
    const previous = this.managedGroupIds
    const changed = previous === null || !sameMembership(previous, next)
    this.managedGroupIds = [...next]
    this.screenGroupPlan = buildScreenGroupPlan(this.deviceIdentity(), this.managedGroupIds)
    if (changed) this.refreshVariableDefinitions()
    this.writebackVariableValues({ screen_group_count: screenGroupCountValue(this.managedGroupIds) })
  }

  /**
   * GET `pr_group` directly. Its get rule is empty, so this does not go
   * through `isCmdOpSupported`.
   *
   * Success replaces the managed list and returns a copy of the plan for
   * this poll. Failure does not assign `managedGroupIds`: a push that
   * arrived while the get was in flight keeps the list it created, and
   * the returned array is that live plan. The link generation is checked
   * again before any warning or commit, so a dead link neither logs a
   * skip nor writes the new session.
   */
  private async _discoverScreenGroups(generation: number): Promise<readonly ScreenGroupSlot[]> {
    if (generation !== this._linkGeneration) return this.screenGroupPlan
    const identity = this.deviceIdentity()
    let parsed: number[]
    try {
      // Timeout and transport failure come back as undefined; this catch
      // runs only when sendAndAwait actually throws.
      const response = await this.spTransmitter.sendAndAwait('pr_group', 'get', 1)
      if (generation !== this._linkGeneration) return this.screenGroupPlan
      parsed = groupIdsFromPrGroup(response)
    } catch (err) {
      if (generation !== this._linkGeneration) return this.screenGroupPlan
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`screen groups skipped: pr_group failed: ${message}`)
      this.refreshVariableDefinitions()
      return this.screenGroupPlan
    }
    if (parsed.length === 0) {
      logger.warn('screen groups skipped: pr_group did not return group ids.')
      this.refreshVariableDefinitions()
      return this.screenGroupPlan
    }
    const managed = managedGroupIds(identity, parsed)
    const family = resolveDeviceModel(identity.protocol, identity.modelByte)?.family
    // A non-empty parse on any other family still has managed ids. V/VX can
    // filter that parse down to nothing.
    if ((family === 'V' || family === 'VX') && managed.length === 0) {
      logger.warn('screen groups skipped: pr_group returned no screen group 1 or 2.')
      this.refreshVariableDefinitions()
      return this.screenGroupPlan
    }
    if (generation !== this._linkGeneration) return this.screenGroupPlan
    this.commitScreenGroups(managed)
    // Copy so a later plan replacement cannot change this poll's request list.
    return this.screenGroupPlan.map((slot) => ({ cmd: slot.cmd, gid: slot.gid }))
  }

  /**
   * Read installed input boards, then each board's signals, and keep the list
   * for video sync and layer video source. Discovery runs when this device
   * supports `videosrc` set. The dropdown stays empty until this probe
   * returns at least one named signal. A failed or empty read does not replace
   * signals already stored, and does not drop the link.
   */
  private _discoverInputVideoSources(generation: number): void {
    if (
      !isCmdOpSupported('pr_vin_board', 'get', this.deviceIdentity()) ||
      !isCmdOpSupported('pr_video', 'get', this.deviceIdentity())
    )
      return
    void discoverInputVideoSources(
      (cmd, data) => this.spTransmitter.sendAndAwait(cmd, 'get', 1, data),
      (message) => logger.warn(message)
    )
      .then((sources) => {
        if (generation !== this._linkGeneration) return
        // A failed or empty probe must not replace signals already shown.
        if (sources.length === 0) return
        this.state.inputVideoSources = sources
        this.initActions()
      })
      .catch((err: Error) => {
        if (generation !== this._linkGeneration) return
        logger.warn(`input video sources skipped: ${err.message ?? String(err)}`)
      })
  }

  /**
   * Discover groups, then poll that discovery's snapshot.
   * `slotStillPublished` reads the live plan, so a gid removed after its
   * get was sent is not written back. A failed discovery does not drop the link.
   */
  private _startInitialPoll(generation: number): void {
    void this._discoverScreenGroups(generation)
      .then((slots) => {
        if (generation !== this._linkGeneration) return
        return initialPoll.runInitialPoll({
          identity: this.deviceIdentity(),
          slots,
          isCurrent: () => generation === this._linkGeneration,
          slotStillPublished: (cmd, gid) => this.screenGroupPlan.some((slot) => slot.cmd === cmd && slot.gid === gid),
          send: (request) => this.spTransmitter.sendAndAwait(request.cmd, 'get', request.sid, request.data),
          write: this.writebackVariableValues,
          log: (message) => logger.warn(message)
        })
      })
      .catch((err: Error) => {
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
      // Same device still drops the previous link's groups. This link discovers them again.
      this.managedGroupIds = null
      this.screenGroupPlan = []
      this.refreshVariableDefinitions()
      logger.info(`Probe confirms identity: protocol=${mapped}, ${modelDesc}`)
      return
    }

    logger.info(
      `Probe detected identity change: protocol ${this.config.protocol} → ${mapped}, ` +
        `modelByte ${this.state.modelByte} → ${modelByte} (${modelDesc}) (deviceType=${result.deviceType}, host=${host})`
    )
    this.config.protocol = mapped
    this.state.modelByte = modelByte
    this.state.inputVideoSources = []
    // The previous screen-group list belonged to the old identity.
    this.managedGroupIds = null
    this.screenGroupPlan = []
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
   * Handle incoming TCP bytes. SpSession turns them back into String-Protocol JSON.
   */
  public handleIncoming(data: Buffer): void {
    // After refactoring: unified through SPTransmitter (SpSession internally
    // strips <...> and parses JSON)
    this.spTransmitter.handleIncoming(data)
  }
}

/** Set equality. Reordering the same gids is not a membership change. */
function sameMembership(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false
  const a = [...left].sort((x, y) => x - y)
  const b = [...right].sort((x, y) => x - y)
  return a.every((value, index) => value === b[index])
}

export = CltProcessor
