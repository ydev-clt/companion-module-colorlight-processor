import type { SomeCompanionConfigField } from '@companion-module/base'
import type { ProcessorBase, DeviceConfig, ModuleTypes } from './common/types'
import type { SPTransmitterHost } from './actions/string-protocol/core/transmitter'
import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { defaultConfig, generateConfigFields, normalizeConfig } from './config'
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
  screenGroupCountValue,
  type ScreenGroupSlot
} from './variables/screen-groups'
import { getProtocolForDeviceType, type ProbeResult } from './udp-probe'
import { describeDeviceSupport, resolveDeviceModel } from './common/device-models'
import { isCmdOpSupported } from './common/cmd-support'
import { CMD } from './common/commands'
import { discoverInputVideoSources } from './common/input-video-sources'
import { bindSession } from './session-bind'
import { routePush } from './push-router'

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
    this.setActionDefinitions(setupActions(this, this.spTransmitter, this.writebackVariableValues, this.actionMutex))
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
    const normalized = normalizeConfig(config)
    this.config = normalized.config
    // A new config means a new link; do not keep the previous device identity,
    // input signals, or screen-group plan until the probe answers again.
    this.state.reset()
    this.managedGroupIds = null
    this.screenGroupPlan = []

    logger.info(`Config updated. host=${this.config.host}, port=${this.config.port}`)
    if (normalized.error) logger.error(normalized.error)

    // Probe success binds SpSession. Link loss clears identity and reconnects.
    this.connection.setOnProbeResult((result, tcpConnected) => {
      const host = this.config.host
      this._onProbeResult(result, host, tcpConnected)
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

    if (!normalized.error && this.config.host) {
      this.connection.open(this.config.host, this.config.port)
    } else {
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

  private _onProbeResult(result: ProbeResult | null, host: string, tcpConnected: boolean): void {
    if (result) {
      this._applyDetectedIdentity(result, host)
      // An unsupported model is reported without opening TCP; there is no
      // session to bind, so keep heartbeat and polling off as well.
      if (tcpConnected) this._bindSpSessionFromConfig(this._linkGeneration)
      return
    }
    this._clearDetectedIdentity(host)
  }

  private _clearDetectedIdentity(host: string): void {
    logger.warn(`Probe lost device (host=${host}); clearing identity`)
    this.state.reset()
    // Unknown list: device variables stay, screen-group variables do not.
    this.managedGroupIds = null
    this.screenGroupPlan = []
    this.refreshVariableDefinitions()
    this.initActions()
    this.initFeedbacks()
    this.spTransmitter.releaseSpSession()
  }

  private _bindSpSessionFromConfig(generation: number): void {
    void bindSession(generation, {
      transmitter: this.spTransmitter,
      connection: this.connection,
      identity: () => this.deviceIdentity(),
      isCurrent: (current) => current === this._linkGeneration,
      onPush: (item) => this._handlePush(generation, item),
      onHeartbeatLost: () => {
        logger.warn('Heartbeat lost.')
        this.failLink()
      },
      onBindFailed: () => this.failLink(),
      startInitialPoll: (current) => this._startInitialPoll(current),
      discoverInputSources: (current) => this._discoverInputVideoSources(current),
      runSerialized: (fn) => this.actionMutex.run(fn)
    })
  }

  /**
   * Apply one accepted push notice. Protocol validation stays here so the
   * pure router only decides how the plan changes and which leaves to write.
   * The router also names the gids this push added; they get one get round so
   * the variables the push did not carry do not stay empty.
   */
  private _handlePush(generation: number, item: Record<string, unknown>): void {
    const cmd = item.cmd
    const code = item.code
    if (typeof cmd !== 'string') return
    if (typeof code === 'number' && code !== 0) {
      logger.warn(`push ${cmd} code=${code} ignored`)
      return
    }

    const route = routePush({
      cmd,
      code,
      data: item.data,
      identity: this.deviceIdentity(),
      managedGroupIds: this.managedGroupIds,
      slots: this.screenGroupPlan
    })
    this.logPushRoute(cmd, item.data, route)
    if (route.nextGroupIds) this.commitScreenGroups(route.nextGroupIds)
    if (route.addedGroupIds && route.addedGroupIds.length > 0) {
      this.syncAddedScreenGroups(generation, route.addedGroupIds)
    }
    if (route.values) this.writebackVariableValues(route.values)
  }

  /**
   * Diagnostic line for the push route. `pr_group` and any push that added a
   * gid are logged at info; a screen push for an unmanaged gid is logged at
   * debug so a noisy device does not flood the log.
   */
  private logPushRoute(cmd: string, data: unknown, route: ReturnType<typeof routePush>): void {
    const managed = this.managedGroupIds?.join(',') ?? 'unset'
    if (cmd === CMD.PR_GROUP) {
      logger.info(
        `push pr_group: data=${JSON.stringify(data)} managed=[${managed}] ` +
          `next=[${route.nextGroupIds?.join(',') ?? '-'}] added=[${route.addedGroupIds?.join(',') ?? '-'}]`
      )
      return
    }
    if (route.addedGroupIds && route.addedGroupIds.length > 0) {
      logger.info(`push ${cmd}: added gid [${route.addedGroupIds.join(',')}] to managed=[${managed}]`)
      return
    }
    const pushedGid = gidFromPushData(data)
    if (pushedGid !== undefined && !(this.managedGroupIds ?? []).includes(pushedGid)) {
      logger.debug(`push ${cmd}: gid=${pushedGid} is not managed [${managed}]; no slot added for it`)
    }
  }

  /** Protocol and model byte the plan and support checks read. */
  private deviceIdentity(): { protocol: DeviceProtocolEnum; modelByte: number | null } {
    return { protocol: this.state.protocol, modelByte: this.state.modelByte }
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
   * GET every published screen-group slot of the gids a push just added.
   * Their definitions were installed by `commitScreenGroups`, but a push only
   * carries the leaves the device chose to broadcast, so the rest would stay
   * empty until the next link's startup poll. This one-shot sync closes that
   * gap. It shares the get gate and the generation checks with the startup
   * poll, and a slot removed while its get is in flight is not written.
   * No timer and no retry: a failed get is logged and skipped.
   */
  private syncAddedScreenGroups(generation: number, gids: readonly number[]): void {
    if (generation !== this._linkGeneration) {
      logger.info(`Screen group sync skipped: stale link (gids=[${gids.join(',')}])`)
      return
    }
    const wanted = new Set(gids)
    const slots = this.screenGroupPlan.filter((slot) => wanted.has(slot.gid))
    if (slots.length === 0) {
      logger.info(`Screen group sync skipped: no published slots for gid [${gids.join(',')}]`)
      return
    }
    logger.info(`Screen group sync: gid ${gids.join(', ')} (${slots.length} gets)`)
    void initialPoll
      .runInitialPoll({
        identity: this.deviceIdentity(),
        slots,
        includeDeviceRequests: false,
        logLabel: 'screen group sync',
        isCurrent: () => generation === this._linkGeneration,
        slotStillPublished: (cmd, gid) => this.screenGroupPlan.some((slot) => slot.cmd === cmd && slot.gid === gid),
        send: (request) => this.spTransmitter.sendAndAwait(request.cmd, 'get', request.sid, request.data),
        write: this.writebackVariableValues,
        log: (message) => logger.warn(message)
      })
      .then(() => logger.info(`Screen group sync finished: gid ${gids.join(', ')}`))
      .catch((err: Error) => logger.warn(`screen group sync failed: ${err.message ?? String(err)}`))
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
      const response = await this.spTransmitter.sendAndAwait(CMD.PR_GROUP, 'get', 1)
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
   * supports `videosrc` set. The dropdown stays empty until this probe returns
   * signals. The result replaces the list even when empty, because the list
   * belongs to the current link; a failed probe does not drop the link.
   */
  private _discoverInputVideoSources(generation: number): void {
    if (
      !isCmdOpSupported(CMD.PR_VIN_BOARD, 'get', this.deviceIdentity()) ||
      !isCmdOpSupported(CMD.PR_VIDEO, 'get', this.deviceIdentity())
    )
      return
    void discoverInputVideoSources(
      (cmd, data) => this.spTransmitter.sendAndAwait(cmd, 'get', 1, data),
      (message) => logger.warn(message)
    )
      .then((sources) => {
        if (generation !== this._linkGeneration) return
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
   * Report an unsupported probe identity on the instance status.
   *
   * Called after the probe identity has been applied. For a supported device
   * this overrides the Connection's initial Ok status; for an unsupported one
   * no TCP is opened, so the warning is the only status the user sees. A
   * supported identity restores Ok so a warning from the previous link cannot
   * stick.
   */
  private _publishDeviceSupportStatus(): void {
    const support = describeDeviceSupport(this.state.protocol, this.state.modelByte)

    if (support.state === 'supported') {
      this.updateStatus(InstanceStatus.Ok)
      return
    }
    if (support.state !== 'unsupported') return

    const message =
      `Unsupported device: ${support.label}. ` +
      'This module supports U-series, V10, V20 and VX20 only; controls are disabled.'
    logger.warn(message)
    this.updateStatus(InstanceStatus.UnknownWarning, message)
  }

  /**
   * Apply the probe-detected device identity (protocol + model byte).
   *  - protocol → `this.state.protocol` (probe-derived, not config)
   *  - modelByte → `this.state.modelByte`
   * Re-registers actions and feedbacks when either component changes.
   *
   * SpSession rebinding is left to the caller (`_onProbeResult`) so that
   * success and timeout paths converge on a single bind site.
   */
  private _applyDetectedIdentity(result: ProbeResult, host: string): void {
    const mapped = getProtocolForDeviceType(result.deviceType)
    if (!mapped) {
      logger.warn(
        `Unknown device type ${result.deviceType} (host=${host}); keeping identity (protocol=${this.state.protocol})`
      )
      return
    }

    const modelByte = result.model
    const model = resolveDeviceModel(mapped, modelByte)
    const modelDesc = model
      ? `${model.label}${model.family !== undefined ? ` (family=${model.family})` : ''}`
      : `unresolved (modelByte=${modelByte})`

    if (mapped === this.state.protocol && modelByte === this.state.modelByte) {
      // Same device still drops the previous link's groups and input signals.
      // This link discovers them again.
      this.managedGroupIds = null
      this.screenGroupPlan = []
      this.state.inputVideoSources = []
      this.refreshVariableDefinitions()
      logger.info(`Probe confirms identity: protocol=${mapped}, ${modelDesc}`)
      this._publishDeviceSupportStatus()
      return
    }

    logger.info(
      `Probe detected identity change: protocol ${this.state.protocol} → ${mapped}, ` +
        `modelByte ${this.state.modelByte} → ${modelByte} (${modelDesc}) (deviceType=${result.deviceType}, host=${host})`
    )
    this.state.protocol = mapped
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
    this._publishDeviceSupportStatus()
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

/** Numeric gid a push body carries, or undefined when it carries none. */
function gidFromPushData(data: unknown): number | undefined {
  if (data === null || typeof data !== 'object') return undefined
  const gid = (data as { gid?: unknown }).gid
  return typeof gid === 'number' && Number.isFinite(gid) ? gid : undefined
}

export = CltProcessor
