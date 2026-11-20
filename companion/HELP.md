# Colorlight Processor

Control Colorlight LED processors over TCP.

## Setup

| Field       | Default         | Notes                                                          |
| ----------- | --------------- | -------------------------------------------------------------- |
| Target IP   | `192.168.1.10`  | Address of the processor.                                      |
| Target Port | `9999`          | TCP port used for commands.                                    |

The module probes the device on UDP port 9099, then detects its protocol and
model automatically. There is no device-type setting. Actions, feedbacks and
variables are registered only for the detected model, so a button list never
shows a command the connected processor cannot run.

## Supported devices

| Series     | Models                                        | Actions | Variables                 |
| ---------- | --------------------------------------------- | ------- | ------------------------- |
| U-series   | U9 Max, U15, U15 Max, U6 Max, U3 Max, U20 Max | 45      | one set per screen group  |
| V-series   | V10, V20                                      | 17      | one set on screen group 1 |
| VX-series  | VX20                                          | 17      | one set on screen group 1 |

If the probe returns any other model, the instance reports an unsupported
device, disables all controls and does not open the TCP session. An unidentified
model is treated the same way; only the Custom command action is registered.

## Actions

Actions that address a device take a **Device ID** (1–64), and most also offer
**Send to all devices** (sid 255 broadcast). Most screen-group actions also take
a **screen group ID (gid)**, default 1. Custom command sends a raw frame and has
no addressing fields.

**Set Layer Video Source** and **Set Video Sync** (Source: Input signal) pick
from the input signals the module discovers after connecting: it reads the
installed input boards, then each board's signals, and labels each row by
interface name plus an index. The dropdown is empty until that discovery
returns. A saved button whose signal is no longer in the list is skipped with a
warning in the log. Discovery runs again on every new link.

### Available on every supported model (U-series, V10, V20, VX20)

- Set Brightness
- Set Color Temperature
- Set Color Temp Red Gain
- Set Color Temp Green Gain
- Set Color Temp Blue Gain
- Set Freeze Screen (enable, disable, toggle)
- Set Black Screen (enable, disable, toggle)
- Set Test Pattern
- Switch Quick Preset
- Set Layer Video Source
- Set Screen Group Color Depth (8/10/12-bit)
- Set Low-Brightness High-Gray (enable, disable, toggle)
- Set Video Sync
- Custom command (raw hexadecimal frame)

### U-series only

Display & picture:

- Set HDR Mode
- Set Mute
- Set Fade In/Out
- Set Fade Time
- Set Zero Delay

Presets:

- Save Preset
- Rename Preset

Layers:

- Set Layer Position/Size
- Set Layer Border
- Set Background Box Size
- Set Layer Order
- Delete Layer
- Clear All Layers

Network ports:

- Set Network Port Output
- Set All Network Ports Output
- Set Network Port Group Brightness Enable

Color:

- Set Output Color Space
- Set Precise Color Manager
- Set Virtual Pixel

Audio / 3D:

- Set Eye Switch
- Set 3D Mode
- Set Dual 3D Mode
- Set Stereo 3D Source Format

Device:

- Set Serial Number
- Set VSYNC Multiplier
- ⚠ Reboot Device
- ⚠ Shutdown Device

System:

- Set OSD
- Set Frame Rate Adaptation

Multi-function card:

- MFC Relay Manual

Audio preset:

- Load Audio Preset by Index

### V10 / V20 / VX20 only

- Take — fade between preview and program
- Cut — cut between preview and program
- Set Canvas Switch Mode — copy, swap, or toggle the current switch mode

Take, Cut and canvas switch mode require the screen group to be in switcher
mode. Quick preset and layer video source on these models follow the current
canvas mode: normal mode targets PGM, switcher mode targets PVW.

### Not available on any supported model

These commands are hidden automatically because none of the supported models
supports them:

Set UH5 Status, Set Picture Adjust, Set Hue, Set Saturation, Set Contrast,
Set Brightness Compensation, Load Preset, Set Network Port Brightness,
Set Screen Group Intensity Gain, Set EDID for Input Source, Brightness
Relative, Color Temp Relative, Brightness Step, Set Screen Group Frame Rate,
Set Low Power Mode.

## Variables

Variable names follow two rules:

- U-series: one set per screen group, published as `sg_<gid>_<name>`
  (for example `sg_1_brightness`, `sg_2_freeze_enable`). The available group
  IDs come from the device.
- V10 / V20 / VX20: a single set, always published on screen group 1 as
  `sg_1_<name>`. The module tracks screen groups 1 and 2 and exposes their
  state through that one set.

`screen_group_count` is published on every supported model.

### U-series screen-group variables (`sg_<gid>_...`)

| Variable suffix                          | Value                                                        |
| ---------------------------------------- | ------------------------------------------------------------ |
| `brightness`                             | Percentage (0–100.00)                                        |
| `color_temperature`                      | Color temperature value                                      |
| `freeze_enable`                          | 0 = off, 1 = frozen                                          |
| `blackout_enable`                        | 0 = normal, 1 = blackout                                     |
| `testmode_pattern`                       | Test pattern index (0 = off)                                 |
| `hdrmode`                                | 0 off, 1 auto, 2–4 HDR10, 5–7 HLG                            |
| `mute_enable`                            | 0 = off, 1 = muted                                           |
| `fade_enable`                            | 0 = off, 1 = on                                              |
| `fadetime_ms`                            | Fade time in milliseconds                                    |
| `zerodelay`                              | Object `{ enable, mode }`                                    |
| `background_box`                         | Object `{ width, height }`                                   |
| `screen_color_depth`                     | 8, 10 or 12 (bits)                                           |
| `colorspace`                             | 0 native, 1 sRGB, 2 Adobe RGB, 3 PAL, 4 NTSC, 5 Rec.601, 6 Rec.709, 7 Rec.2020, 8 DCI-P3 |
| `precise_color_management_enable`        | 0 = off, 1 = on                                              |
| `screen_color_temperature_r`             | Red gain, percentage                                         |
| `screen_color_temperature_g`             | Green gain, percentage                                       |
| `screen_color_temperature_b`             | Blue gain, percentage                                        |
| `virtual_pixel`                          | Object `{ enable, rate, direction, row_offset, col_offset }` |
| `3d_eye_priority`                        | 0 = left eye, 1 = right eye                                  |
| `3d_enable`                              | 0 = off, 1 = on                                              |
| `dual_3d_mode`                           | 0 = single 3D, 1 = dual 3D                                   |
| `3d_signal_format`                       | 0 = side-by-side / top-and-bottom, 1 = frame sequential       |
| `vsync_multiplier`                       | Object `{ enable, method, multiplier }`                      |
| `osd_enable`                             | 0 = off, 1 = on                                              |
| `low_gray_enable`                        | 0 = off, 1 = on                                              |
| `vsync_src`                              | 0 input, 1 Genlock, 2 internal, 3 auto, 4 ODCK               |

### U-series device variables

| Variable            | Value                                               |
| ------------------- | --------------------------------------------------- |
| `serial_number`     | Device serial number                                |
| `allports_enable`   | 0 = all network ports off, 1 = on                   |
| `port_output`       | Object `{ port, enable }` (startup poll samples port 1) |

### V10 / V20 / VX20 variables (`sg_1_...`)

| Variable suffix                   | Value                                                    |
| --------------------------------- | -------------------------------------------------------- |
| `brightness`                      | Percentage (0–100.00)                                    |
| `color_temperature`               | Color temperature value                                  |
| `freeze_enable`                   | 0 = off, 1 = frozen                                      |
| `blackout_enable`                 | 0 = normal, 1 = blackout                                 |
| `testmode_pattern`                | Test pattern index (0 = off)                             |
| `screen_color_depth`              | 8, 10 or 12 (bits)                                       |
| `screen_color_temperature_r`      | Red gain, percentage                                     |
| `screen_color_temperature_g`      | Green gain, percentage                                   |
| `screen_color_temperature_b`      | Blue gain, percentage                                    |
| `low_gray_enable`                 | 0 = off, 1 = on                                          |
| `canvas_mode`                     | 0 = normal, 1 = switcher (blank when the device reports invalid) |
| `canvas_switch_mode`              | 0 = copy, 1 = swap (blank when invalid)                  |
| `output_frame_rate`               | Output frame rate in Hz                                  |
| `vsync_src`                       | 0 input, 1 Genlock, 2 internal, 3 auto, 4 ODCK           |

### All supported models

| Variable               | Value                                        |
| ---------------------- | -------------------------------------------- |
| `screen_group_count`   | Object `{ count, ids }` for the tracked groups |

## Feedbacks

All three feedbacks are advanced feedbacks with on/off colors, are available on
every supported model, and read the matching per-screen-group variable.

| Feedback                        | Reads                    |
| ------------------------------- | ------------------------ |
| Screen Freeze Status            | `sg_<gid>_freeze_enable` |
| Screen Blackout Status          | `sg_<gid>_blackout_enable` |
| Low-Brightness High-Gray Status | `sg_<gid>_low_gray_enable` |

Select the screen group on the feedback. On V10 / V20 / VX20 use gid 1, because
those models publish their state as the single `sg_1_...` set.

Values are refreshed by the startup poll and by device pushes; get-based actions
also write their results back to the variables.
