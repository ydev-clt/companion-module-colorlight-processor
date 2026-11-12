# companion-module-colorlight-processor

A [Bitfocus Companion](https://bitfocus.io/companion) module for controlling Colorlight LED video processors over TCP.

The module detects the device protocol and model with a UDP probe, then exposes the supported String-Protocol commands as Companion actions and feedbacks.

## Requirements

- Companion with the Node 22 module runtime.
- A Colorlight processor reachable on the configured IP and TCP port.
- The WASM codec assets `src/str2bin/sp_session.js` and `src/str2bin/sp_session.wasm`.

## Configuration

| Field       | Type       | Default         | Notes                                                     |
| ----------- | ---------- | --------------- | --------------------------------------------------------- |
| Target IP   | text input | `192.168.1.10`  | Validated by Companion's IP regex.                        |
| Target Port | text input | `9999`          | Normalized to a number and checked against 1–65535.       |

There is no Device Type field. The protocol (`A-Protocol` / `B-Protocol`) and model byte are probe-derived and live in runtime state, not in user config. An unidentified model registers only the Custom command action.

## Architecture

```text
src/index.ts                  CltProcessor lifecycle, probe identity, definitions
src/connection.ts             UDP discovery + TCP session state machine
src/session-bind.ts           bind SpSession -> push -> receive -> heartbeat -> poll
src/push-router.ts            pure push-to-variable routing
src/actions/                  action aggregators and String-Protocol actions
src/actions/string-protocol/  core transport + per-domain action modules
src/variables/                variable definitions, poll catalog, screen-group plan
src/feedbacks/                freeze / blackout / low-gray feedbacks
src/common/                   shared types, command catalog, support matrix, parsers
src/str2bin/                  WASM-backed JSON <-> device binary codec
```

### Request flow

1. `Connection` probes UDP 9099 with `0xEB` / `0xEA` and opens TCP after a result.
2. `CltProcessor` applies the probe identity to `StateCache`, then `session-bind.ts` binds `SpSession`.
3. The push subscription and the serialized receive path start before heartbeat and the initial poll.
4. Actions encode a String-Protocol request through `SpSession`, and responses are routed back by transaction id.
5. One `ActionMutex` per instance serializes action callbacks; heartbeat uses the same lock. `GetGate` still serializes protocol-level inbound traffic.

The command support matrix in `src/common/cmd-support.ts` is keyed by the typed command catalog in `src/common/commands.ts`; actions, feedbacks, polling and variables all filter against it. Unresolved models fail closed.

## Supported commands

`companion/HELP.md` contains the user-facing command list. It is grouped into Display & Picture, Layers, Presets, Audio / 3D, Network Ports, Device, System, Canvas / Sync, and Custom.

Two behaviors worth noting:

- **Low gray** is available on every resolved B-Protocol model, not only V/VX.
- **Quick preset** and **layer video source** on V/VX read `canvas_mode` and choose the target canvas: normal mode sends to PGM, switcher mode sends to PVW. Non-V/VX devices use the page `gid`.

## Development

The repository uses Yarn for dependency resolution.

```bash
yarn install
npm run build        # tsc + WASM asset copy into dist/
npm run dev          # watch mode
npm test             # pretest builds, then runs node:test
npm run typecheck    # tsc --noEmit
npm run format:check # Prettier check
npm run package      # companion-module-build package
```

Tests import the compiled output from `dist/`, so `npm test` runs `build` first. The WASM binary is required by the codec loader; if it is missing, tests that import the action layer fail before running.

### Adding a command

1. Add the short code to `CMD` in `src/common/commands.ts`.
2. Add the action id to `src/actions/string-protocol/core/ids.ts`.
3. Implement the action in the relevant `src/actions/string-protocol/actions/*.ts` module and register it in that module's setup function.
4. Map the action id to the command in `src/actions/string-protocol/core/action-cmds.ts`.
5. Add get/set support rows in `src/common/cmd-support.ts`.
6. If the command participates in polling or variables, add it to `src/variables/initial/catalog.ts` and the registry in `src/variables/core/registry.ts`.
7. Run `npm test` and `npm run typecheck`.

## License

MIT — see [LICENSE](LICENSE).
