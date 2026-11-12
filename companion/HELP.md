## Colorlight Processor

In the instance configuration set the target device IP (default `192.168.1.10`) and the target TCP port (default `9999`). The device type is detected automatically by the UDP probe; commands are registered only for the detected protocol and model.

**Available devices for B-Protocol or A-Protocol**

- B-Protocol Device: U9 Max, X100/X100Pro-Series, X26m, X20m/X40m, Z8t, Z6PRO-G2, Z4Pro/Z5, D9/D16, V8
- A-Protocol Device: X2s/X4s, X2m/X4m, X6/X7, X12, X8E/X16E/X20, S20

Commands whose get/set support is unknown for the detected model stay hidden. An unidentified model keeps only the Custom command action.

**Available commands for Colorlight Processor**

Display & Picture

- Open/Close black screen
- Open/Close freeze screen
- Switch test pattern
- Set brightness
- Adjust brightness relatively
- Adjust brightness by step
- Set color temperature
- Adjust color temperature relatively
- Set color temperature R/G/B gain
- Set screen group intensity gain
- Switch HDR mode
- Mute output
- Enable/disable fade in/out
- Set fade time
- Enable/disable zero delay
- Set output color space
- Enable/disable precise color manager
- Enable/disable virtual pixel
- Adjust picture (hue, saturation, brightness compensation, contrast, gamma)
- Set low-brightness high-gray (low gray) on, off, or toggle
- Set UH5 status (A protocol only)

Layers

- Set layer position and size
- Set layer border (B protocol only)
- Set background box size
- Set layer z-order (B protocol only)
- Delete layer (B protocol only)
- Clear all layers (B protocol only)

Presets

- Switch quick preset
- Save preset
- Load preset
- Rename preset
- Load audio preset by index (B protocol only)

Audio / 3D

- Switch left/right eye output
- Enable/disable 3D output
- Switch single/dual 3D mode (B protocol only)
- Set stereo 3D source format

Network Ports

- Enable/disable a network port output
- Enable/disable all network ports output
- Set network port brightness
- Set screen group color depth
- Enable/disable network port group brightness (B protocol only)

Device

- Set serial number
- Set EDID for input source
- Set VSYNC multiplier
- Manually control MFC relay
- Reboot device (B protocol only)
- Shutdown device

System

- Switch OSD (video / image / subtitle)
- Set screen group frame rate multiplication mode
- Enable/disable frame rate adaptation (B protocol only)
- Enable/disable low power mode (B protocol only)

Canvas / Sync

- Take and Cut (V/VX only)
- Set canvas switch mode to copy, swap, or toggle (V/VX only)
- Set video sync source, input board, internal frame rate, or phase

Take, Cut, and canvas switch mode require the screen group to already be in switcher mode. Quick preset and layer video source use the current canvas mode to choose PGM or PVW on V/VX.
