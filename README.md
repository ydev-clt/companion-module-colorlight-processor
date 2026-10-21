# companion-module-colorlight-processor

A [Bitfocus Companion](https://bitfocus.io/companion) module for controlling Colorlight LED video processors over TCP.

The module supports A-Protocol and B-Protocol devices across the U-, Z-, X-, V-, VX-, D- and selected S-Series, exposing 70+ commands grouped under Display / Picture / Presets / Layers / Network Ports / Audio & 3D / Color / Device / System / Probe / MFC / Custom.

> Module version: **1.2.1** · Runtime: Node 18 + Companion Node IPC · Entry: `dist/index.js`

---

## Table of Contents

- [Features](#features)
- [Configuration](#configuration)
- [Compatible Devices](#compatible-devices)
- [Supported Commands](#supported-commands)
- [How It Works](#how-it-works)
- [Repository Layout](#repository-layout)
- [Development & Build](#development--build)
- [License](#license)

---

## Features

- **Two protocol families** — A-Protocol and B-Protocol, automatically detected on connect via a TCP probe (`0xEB` / `0xEA`, and a 17-byte model query when the device type is 0).
- **70+ commands** unified through the String-Protocol layer; the V/Z binary legacy templates (`src/actions/zv-protocol/`) are kept in source as a reference but are no longer registered.
- **WASM-backed string ↔ binary codec** — `src/str2bin/sp_session.wasm` plus the `SpSession` JS bridge convert between `<{ UTF-8 JSON }>` frames and the device's on-wire binary form for both protocols.
- **Capability-aware action set** — each action declares the protocols (and model families) it supports; `filterActionsForDevice` removes unsupported actions from the UI automatically. New commands are added by editing `ACTION_SUPPORT` (compile-time completeness check). The probe-resolved device model gates visibility: an unresolved model registers no actions (fail-safe).
- **Stateful feedbacks** — Blackout and Freeze Screen feedbacks read from a `StateCache` updated by String-Protocol responses.
- **Auto-reconnect & heartbeat** — TCP discovery retries a full `0xEB` 2 s later when the socket is still up. If the socket dies before a probe result, it reconnects after 2 s without clearing a previously detected identity. After `SpSession` binds, a `heartbeat` get (`sid=1`) is sent immediately and again 10 s after each response. If that heartbeat times out, fails to send, or the TCP socket drops, the instance returns to `Connecting`, the detected identity is cleared, and a full probe runs again 2 s after reconnecting.
- **Pluggable architecture** — `Connection` (TCP socket + probe state machine), `SPTransmitter` (transaction-id allocator + response routing + heartbeat), and per-domain action modules are independent and individually testable.

## Configuration

Open the instance config tab and provide:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| Target IP | textinput | `192.168.1.10` | Companion's IP regex validates the entry. |
| Target Port | textinput | `9999` | TCP port; Companion's port regex validates the entry. Saved values are left as the user configured them. |
| Device Type | dropdown | `None` (hidden) | `A-Protocol` / `B-Protocol` / `None`. |

The Device Type dropdown is hidden in the UI (`isVisible: () => false`) — the protocol is auto-detected from the TCP probe response, and the resolved value is written back into `config.protocol` so users can confirm it in the instance log.

### Note on protocol naming

The legacy Z-Protocol / V-Protocol naming has been renamed to A-Protocol / B-Protocol to match the new unified string protocol spec. Action / feedback IDs remain stable across the rename.

## Compatible Devices

**A-Protocol Device**

X2s / X4s, X2m / X4m, X6 / X7, X12, X8E / X16E / X20, S20

**B-Protocol Device**

U9 Max, X100 / X100Pro-Series, X26m, X20m / X40m, Z8t, Z6PRO-G2, Z4Pro / Z5, D9 / D16, V8

The protocol is auto-detected on first probe; the device model byte at offset `0x17` (23) of the `0xEA` response selects A- or B-Protocol.

## Supported Commands

The full set of 70+ actions is grouped into the following themes (full id list lives in [`src/actions/string-protocol/core/ids.ts`](src/actions/string-protocol/core/ids.ts)):

### Display & Picture

- Open / Close black screen
- Open / Close freeze screen
- Switch test pattern (15 predefined patterns)
- Set brightness
- Adjust brightness relatively
- Adjust brightness by step
- Set color temperature
- Adjust color temperature relatively
- Set color temperature R / G / B gain
- Set screen group intensity gain
- Switch HDR mode
- Mute output
- Enable / disable fade in / out
- Set fade time
- Enable / disable zero delay
- Set output color space
- Enable / disable precise color manager
- Enable / disable virtual pixel
- Adjust picture (hue, saturation, brightness compensation, contrast, gamma)
- Set UH5 status (A-Protocol only)

### Layers

- Set layer position and size
- Toggle layer border (B-Protocol only)
- Set background box size
- Set layer z-order (B-Protocol only)
- Delete layer (B-Protocol only)
- Clear all layers (B-Protocol only)

### Presets

- Switch quick preset
- Save preset
- Load preset
- Rename preset
- Load audio preset by ID (B-Protocol only)
- Load audio preset by index (B-Protocol only)

### Audio / 3D

- Switch left / right eye output
- Enable / disable 3D output
- Switch single / dual 3D mode (B-Protocol only)
- Set stereo 3D source format

### Network Ports

- Enable / disable a network port output
- Enable / disable all network ports output
- Set network port brightness
- Set network port color depth
- Enable / disable network port group brightness (B-Protocol only)

### Device

- Set serial number
- Set EDID for input source
- Set VSYNC multiplier
- Manually control MFC relay
- Restore host work
- Reboot device (B-Protocol only)
- Shutdown device

### System

- Switch OSD (video / image / subtitle)
- Set screen group frame rate multiplication mode
- Enable / disable frame rate adaptation (B-Protocol only)
- Enable / disable low power mode (B-Protocol only)

### Probe (read-only)

Query the running state of the device and its cascaded cards: `sndinfo`, `snd_eth`, `pr_layer`, `pr_group`, `pr_video`, `pr_vsync`, `port_area`, `pr_video_count`, `pr_rcv_state`, `mfc_probe`, `rcv_probe`, `mod_probe`.

### Feedbacks

| ID | Name | Type | Behavior |
| --- | --- | --- | --- |
| `blackout` | Screen Blackout Status | advanced | Switch fg / bg between two color pairs based on `state.isBlackScreen`. |
| `freezeScreen` | Screen Freeze Status | advanced | Switch fg / bg between two color pairs based on `state.isFreezeScreen`. |

Both feedbacks read from a local `StateCache` whose setters (`isBlackScreen`, `isFreezeScreen`) trigger Companion's `checkFeedbacks(...)` to re-evaluate the button style.

## How It Works

```text
┌───────────────────────┐
│ Companion UI          │   ← user clicks an action
└───────────────────────┘
            ▼
┌───────────────────────┐
│ src/index.ts          │   ← CltProcessor (InstanceBase)
│   - setupActions()    │     → setupStringActions() (one path)
│   - setupFeedbacks()  │     → setupFeedbacks() (always)
└───────────────────────┘
            ▼
┌───────────────────────┐
│ src/actions/          │
│ string-protocol/      │   ← per-domain action files (display, picture,
│   actions/*.ts        │     presets, layers, ports, audio-3d, color,
│                       │     device, system, mfc, probe, ...)
│   core/transmitter.ts │   ← SPTransmitter:
│                       │     - TransactionIdAllocator
│                       │     - request/response routing
│                       │     - heartbeat (10s default)
│                       │     - bind/release SpSession
└───────────────────────┘
            ▼                  JSON  <[{ id, cmd, sid, op, data }]>
┌───────────────────────┐
│ src/str2bin/          │   ← SpSession (WASM + JS bridge):
│   sp_session.wasm     │     - inbound: JSON → bin
│   sp_session.js       │     - outbound: bin → JSON
└───────────────────────┘
            ▼                  binary frame
┌───────────────────────┐
│ src/connection.ts     │   ← TCPHelper (Companion, reconnect off), 0xEB/0xF1 probe
│   Connection          │     state machine, retry on timeout
└───────────────────────┘
            ▼
┌───────────────────────┐
│ Colorlight device     │
└───────────────────────┘
```

### Lifecycle

1. **Boot** — Companion loads `dist/index.js`. `CltProcessor` constructs `Connection`, `StateCache`, and `SPTransmitter`. `config.protocol` is set to `None`; TCP is not opened yet.
2. **First config save** — `configUpdated()` calls `connection.open(host, port)` to start the TCP probe, then registers actions and feedbacks. The protocol dropdown in `config.ts` is `isVisible: () => false`; the value is decided by the probe.
3. **Probe** — After TCP connects, `Connection` sends a 9-byte `0xEB` request and waits for one `0xEA` frame. Bytes are buffered until the little-endian length at offset 2 is complete. For device type 1/2 the model byte is read from `0xEA` offset 23. For device type 0 a 17-byte model query is sent and the model is read from the `0xF1` reply (offset 12). Bytes other than that probe frame are discarded until `beginReceiving()`. On success the identity callback selects A- or B-Protocol, stores the model byte, re-registers actions, binds `SpSession`, sets `InstanceStatus.Ok`, then starts business receive and the heartbeat.
4. **Action** — A button click calls a String-Protocol action's `callback`. The action allocates a transaction id, encodes a `<{ id, cmd, sid, op, data }>` frame, asks `SpSession.inbound(token, frame)` for the wire bytes, and sends them over TCP via `host.send(bin)`. For `set` operations the synthesized set-response is dispatched immediately; for `get` the actual device response is routed back via `_handlers` keyed by transaction id.
5. **Heartbeat** — `SPTransmitter` sends `heartbeat` / `get` / `sid=1` through `SpSession.inbound`. The first frame goes out as soon as bind resolves. The next frame is 10 s after a response (`code` 0 or non-zero). A timeout, encode failure, or send failure clears the identity and reconnects. Button-command timeouts do not.
6. **Reconnect** — Link loss uses one 2 s timer. Changing the config or destroying the instance cancels that timer. A failed probe before the first success on this socket does not clear identity.
7. **Teardown** — `destroy()` closes the TCP socket and releases the `SpSession` (`drop(token)` + `destroy()`).

### Action protocol support

Every action is registered once and then filtered through `filterActionsForDevice(merged, { protocol, modelByte })` using the matrix in `src/actions/string-protocol/core/action-support.ts`. The matrix is keyed by `ACTION_ID` and is type-checked at compile time: adding a new `ACTION_ID` without a row will fail the build. Rules are protocol baselines (`AB` / `[A]` / `[B]`) with optional model-family exceptions (e.g. `{ protocols: AB, except: ['U'] }`); the device model registry (`src/device-models.ts`) maps the probe model byte to a model and family — U-series devices share one family, other B models are record-only. A model that cannot be resolved registers no actions at all (global strict fail-safe). This keeps the UI free of unsupported commands without duplicating registration logic.

### State caching

`StateCache` is a lightweight in-memory layer that mirrors black-screen and freeze-screen state. The `set` setters trigger the corresponding String-Protocol feedback (`BLACKOUT` / `FREEZE_SCREEN`) via Companion's `checkFeedbacks(...)`. Action callbacks write back into the cache so feedbacks reflect the latest user-triggered command.

## Repository Layout

```text
companion-module-colorlight-processor/
├── companion/                            # Companion packaging metadata
│   ├── HELP.md                           # Shown in Companion's in-app help
│   └── manifest.json                     # Module manifest (id, version, products, entrypoint)
├── src/
│   ├── index.ts                          # CltProcessor entry point
│   ├── config.ts                         # Config fields & defaults
│   ├── connection.ts                     # TCPHelper + 0xEB/0xF1 probe state machine
│   ├── device-models.ts                  # Device model registry (byte → label/family) + resolver
│   ├── udp-probe.ts                      # Probe request/response parser + protocol mapping
│   ├── log.ts                            # Logger bridge to InstanceBase.log
│   ├── types.ts                          # Shared types & DeviceProtocolEnum
│   ├── actions/
│   │   ├── index.ts                      # Action aggregator → String-Protocol
│   │   ├── string-protocol/
│   │   │   ├── index.ts                  # setupStringActions + re-exports
│   │   │   ├── core/                     # constants, frames, ids, transmitter,
│   │   │   │                             # action-support, types
│   │   │   └── actions/                  # display / picture / presets / layers /
│   │   │                                 # ports / audio-3d / color / device /
│   │   │                                 # system / mfc / probe / connection
│   │   └── zv-protocol/                  # Legacy V/Z binary templates (kept as
│   │                                     # source reference, no longer registered)
│   ├── feedbacks/
│   │   ├── index.ts                      # Aggregator → blackout + freeze-screen
│   │   ├── blackout.ts                   # Black screen status feedback
│   │   └── freeze-screen.ts              # Freeze screen status feedback
│   ├── state/
│   │   └── index.ts                      # StateCache (blackScreen, freezeScreen, modelByte)
│   └── str2bin/                          # WASM-based String-Protocol codec
│       ├── index.ts                      # TypeScript exports / SpSession wrapper
│       ├── platform.ts                   # Node-side WASM loader
│       ├── sp_session.js                 # Pre-built WASM JS bridge
│       └── sp_session.wasm               # Codec binary
├── scripts/                              # dev / build helper scripts
├── .github/                              # Issue templates + Actions
├── package.json
├── tsconfig.json
├── build-config.cjs
└── README.md
```

## Development & Build

The repository ships a `yarn.lock`; please use yarn to keep dependency resolution reproducible.

```bash
# Install dependencies
yarn install

# Development (watch + recompile to dist/)
yarn dev

# Single-shot build (writes dist/index.js)
yarn build

# Package as a Companion-installable .zip
yarn package
```

After `yarn build` (or `yarn package`) the resulting module can be sideloaded into Companion from the **Modules → Add Module** dialog.

### Adding a new String-Protocol command

1. Add the command short-code to `CMD` in [`src/actions/string-protocol/core/constants.ts`](src/actions/string-protocol/core/constants.ts).
2. Add a stable id to `ACTION_ID` in [`src/actions/string-protocol/core/ids.ts`](src/actions/string-protocol/core/ids.ts).
3. Add the action callback under the appropriate theme file in [`src/actions/string-protocol/actions/`](src/actions/string-protocol/actions/), and register it in `setupStringActions` ([`src/actions/string-protocol/index.ts`](src/actions/string-protocol/index.ts)).
4. Add a row to `ACTION_SUPPORT` in [`src/actions/string-protocol/core/action-support.ts`](src/actions/string-protocol/core/action-support.ts) listing the protocols (and optional `except` model families) that support it.
5. If the action also updates black-screen / freeze-screen state, write back into `state.isBlackScreen` / `state.isFreezeScreen` from the callback so the matching feedback flips.

### Logs

All modules route through [`src/log.ts`](src/log.ts), which bridges into `InstanceBase.log`. Key log points:

- TCP probe send / receive / retry / timeout
- SpSession bind / release / encode / decode errors
- Outbound String-Protocol request frames
- Inbound response frames with `code` (warn when `code !== 0`)
- State changes (black / freeze)

Logs are visible in Companion's instance log panel and are the first place to look when troubleshooting.

## License

MIT — see [`LICENSE`](LICENSE).
