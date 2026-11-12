/** Beats that may fail in a row before the link is declared lost. */
export const HEARTBEAT_MAX_CONSECUTIVE_FAILURES = 3

/**
 * One heartbeat at a time.
 * A resolved value means the device answered and resets the failure streak.
 * undefined or a throw counts as one failed beat; the link fails only after
 * {@link HEARTBEAT_MAX_CONSECUTIVE_FAILURES} failures in a row. A missed beat
 * still schedules the next one, so the streak is measured over consecutive
 * attempts. stop() makes a late result a no-op.
 */
export class HeartbeatRunner {
  private timer: NodeJS.Timeout | null = null
  private active = false
  private inFlight = false
  private consecutiveFailures = 0

  constructor(
    private readonly send: () => Promise<unknown>,
    private readonly intervalMs: number,
    private readonly onFailure: () => void
  ) {}

  start(): void {
    this.stop()
    this.active = true
    this.consecutiveFailures = 0
    void this.run()
  }

  stop(): void {
    this.active = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private async run(): Promise<void> {
    if (!this.active || this.inFlight) return
    this.inFlight = true
    let failed = false
    try {
      const resp = await this.send()
      if (!this.active) return
      if (resp === undefined) failed = true
    } catch {
      if (!this.active) return
      failed = true
    } finally {
      this.inFlight = false
    }
    if (!this.active) return
    if (failed) {
      this.consecutiveFailures += 1
      if (this.consecutiveFailures >= HEARTBEAT_MAX_CONSECUTIVE_FAILURES) {
        this.active = false
        this.onFailure()
        return
      }
    } else {
      this.consecutiveFailures = 0
    }
    this.timer = setTimeout(() => {
      this.timer = null
      void this.run()
    }, this.intervalMs)
  }
}
