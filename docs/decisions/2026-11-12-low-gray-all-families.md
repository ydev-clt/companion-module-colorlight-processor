# Decision: low gray is available on every resolved B-Protocol model

Date: 2026-11-12
Status: accepted

## Context

`low_gray` was originally restricted to the V/VX families in the support matrix and several tests. A later support update changed the matrix entry to `AB` (all protocols), which makes the action, feedback and `low_gray_enable` variable available on U-series and other resolved B-Protocol models as well.

## Decision

Keep `low_gray` as `{ get: AB, set: AB }`.

The user confirmed this is intentional. Tests and user-facing docs were updated to match; the support matrix entry is not reverted to `V_VX_ONLY`.

## Consequences

- U9 and other resolved non-V/VX B-Protocol devices register the low-gray action and feedback.
- Their screen-group plans, initial poll and push projection include `low_gray`.
- A-Protocol devices and unresolved models still fail closed because `A_DEVICE_MODELS` is empty and no family resolves.
- The historical designs `docs/superpowers/specs/2026-11-02-vx-canvas-sync-design.md` and `docs/superpowers/specs/2026-11-09-low-gray-feedback-design.md` describe the earlier V/VX-only rule; this decision supersedes those statements without rewriting the historical documents.

## Related notes

- Quick preset wording stays as implemented: `According to the current canvas mode, change the preset on PGM or PVW.` On V/VX, normal mode targets PGM and switcher mode targets PVW. The longer wording in the 2026-11-04 design document is not adopted.
- Tests updated: `cmd-support`, `canvas-actions`, `feedback-support`, `poll-catalog`, `screen-group-plan`, `variables-publish`, `push-project`.
