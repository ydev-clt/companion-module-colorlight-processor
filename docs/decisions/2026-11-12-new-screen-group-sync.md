# Decision: sync a screen group's variables when a push adds it

Date: 2026-11-12
Status: accepted

## Context

Push handling registers the full variable set of a new screen group, but a push only carries the leaves the device chose to broadcast. When the device adds screen group 3, the `pr_group` push names it and the following burst carries `pr_canvas`, `canvas_mode`, `bg_box`, `fade`, `c_depth`, `virtual_pixel`, `zerodelay` and similar fields, but not `freeze`. `sg_3_freeze_enable` therefore stayed at Companion's default empty string until the next link's startup poll.

The earlier design (`2026-11-05-screen-group-variable-plan-design.md` in the main worktree) deliberately avoided extra gets for a newly added gid. This decision reverses that part only.

## Decision

When a push makes a gid enter the managed list, run one get round for every published screen-group slot of that gid.

- `routePush` reports the added gids (`addedGroupIds`) together with `nextGroupIds`; it stays pure.
- `_handlePush` commits the list, launches `syncAddedScreenGroups`, then writes the push's own leaves. The push values land first; the get results arrive later and overwrite them with the device's current state.
- The sync reuses `runInitialPoll` with `includeDeviceRequests: false` and `logLabel: 'screen group sync'`, so it sends only the new gid's screen slots, shares the get gate with the startup poll, checks the link generation, and skips a slot whose gid left the plan while its get was in flight.
- No timer, no retry, no de-duplication state. A failed get logs `screen group sync <cmd> failed gid=<gid>` and the next get continues.
- V/VX keep only groups 1 and 2; a gid 3 push adds nothing, so no sync runs.

## Consequences

- Adding a screen group mid-session fills its `sg_<gid>_*` variables immediately instead of waiting for a reconnect.
- A push that adds a gid while the startup poll is running can get the same gid twice; the later write wins and is identical.
- `selectScreenRequests` is now shared by the startup poll and the one-shot sync; `selectPollRequests` appends the device-wide requests to it.
- Tests: `push-router` (added gids), `screen-group-plan` (`addedGroupIds`), `poll-catalog` (`selectScreenRequests`), `poll-runner` (screen-only sync).
