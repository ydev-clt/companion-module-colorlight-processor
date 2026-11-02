/**
 * Screen groups polled and published at startup.
 * Startup currently addresses group 1 only. Action gid fields already accept 1..128.
 */
export function getScreenGroupIds(): readonly number[] {
  return [1]
}
