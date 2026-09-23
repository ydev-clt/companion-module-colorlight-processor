/**
 * GetGate — allows only one String-Protocol `get` in flight at a time.
 *
 * libsp rejects a second `get` inbound until the previous `get` response has
 * gone through outbound (or the token was dropped). Callers `await acquire()`
 * before inbound and call the returned release function exactly when the
 * request finishes. Waiters are served in FIFO order.
 *
 * A release function only affects the holder it was issued to: calling it
 * twice, or after `rejectAll()`, is a no-op. This keeps a late-finishing
 * request from a previous SpSession from freeing a newer holder's slot.
 */

interface Waiter {
  resolve: (release: () => void) => void
  reject: (err: Error) => void
}

export class GetGate {
  private _holder: symbol | null = null
  private _waiters: Waiter[] = []

  get busy(): boolean {
    return this._holder !== null
  }

  get waiting(): number {
    return this._waiters.length
  }

  acquire(): Promise<() => void> {
    if (this._holder === null) {
      return Promise.resolve(this._grant())
    }
    return new Promise<() => void>((resolve, reject) => {
      this._waiters.push({ resolve, reject })
    })
  }

  /** Reject every waiter, invalidate the current holder and reset to idle. */
  rejectAll(err: Error): void {
    const waiters = this._waiters
    this._waiters = []
    this._holder = null
    for (const w of waiters) w.reject(err)
  }

  private _grant(): () => void {
    const ticket = Symbol('get-gate')
    this._holder = ticket
    return () => {
      if (this._holder !== ticket) return
      this._holder = null
      const next = this._waiters.shift()
      if (next) next.resolve(this._grant())
    }
  }
}
