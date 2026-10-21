/**
 * One heartbeat at a time.
 * A resolved value means the device answered. undefined or a throw means the link failed.
 * stop() makes a late result a no-op.
 */
export class HeartbeatRunner {
  private timer: NodeJS.Timeout | null = null
  private active = false
  private inFlight = false

  constructor(
    private readonly send: () => Promise<unknown>,
    private readonly intervalMs: number,
    private readonly onFailure: () => void
  ) {}

  start(): void {
    this.stop()
    this.active = true
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
      this.active = false
      this.onFailure()
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      void this.run()
    }, this.intervalMs)
  }
}
