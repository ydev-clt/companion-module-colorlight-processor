/**
 * ActionMutex — serializes Companion String-Protocol action callbacks.
 *
 * Companion may invoke multiple action callbacks concurrently. Multi-step
 * actions (set then get) need the whole callback to run without another
 * action interleaving. Callers wrap callbacks with `mutex.run(() => ...)`.
 *
 * Failures inside `fn` still release the lock so later actions are not stuck.
 */
export class ActionMutex {
	private _tail: Promise<void> = Promise.resolve()

	run<T>(fn: () => Promise<T>): Promise<T> {
		const result = this._tail.then(() => fn())
		// Swallow rejection on the chain so a failed action does not poison the queue.
		this._tail = result.then(
			() => undefined,
			() => undefined
		)
		return result
	}
}
