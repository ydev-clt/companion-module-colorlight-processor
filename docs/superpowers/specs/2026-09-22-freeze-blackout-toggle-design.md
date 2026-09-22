# 冻结与黑屏切换

## 背景

String 协议的 Set Freeze Screen 与 Set Black Screen 目前只有 Open（`en=1`）和 Close（`en=0`），都是直接 `set`。同一协议已经有对应的 `get`，亮度步进也是先读当前值再下发。

本设计在这两个动作的现有开/关下拉上增加 Toggle。选 Toggle 时，先向设备查询当前 `en`，再下发相反值。

## 范围

只改 String 协议的这两个设置动作：

- `ACTION_ID.FREEZE_SCREEN_SET`（命令 `freeze`）
- `ACTION_ID.BLACKOUT_SET`（命令 `blackout`）

不改 ZV 协议的 Open/Close。不改静音、淡入淡出、零延迟、UH5 等仍使用 `openCloseField` 的动作。不新增动作 ID。不改现有 Get 动作。不写 `freeze_enable`、`blackout_enable`，也不改反馈。

## 行为

`src/actions/string-protocol/actions/_shared.ts` 新增 `openCloseToggleField`，默认值 `1`。选项为：

| 标签 | id |
| --- | --- |
| Open | 1 |
| Close | 0 |
| Toggle | 2 |

字段标签为 `Open/Close/Toggle`。原来的 `openCloseField` 保持两项，不被这两个动作继续使用。

Set Freeze Screen 的说明改为：`Freeze the output (en=1), unfreeze (en=0), or toggle the current state.`

Set Black Screen 的说明改为：`Blackout (en=1), restore (en=0), or toggle the current state.`

`src/actions/string-protocol/actions/display.ts` 内增加一个仅供这两个动作使用的函数 `sendOpenCloseOrToggle`。两个回调把各自的命令名和日志功能名（`Freeze` 或 `Blackout`）传进去。

`sid` 仍由 `sidFromOptions` 决定：勾选发送到所有设备时为 `255`，否则为设备 ID。`gid` 的规则与现在相同：选项里 `gid` 的类型是 number 时，查询和下发都带上同一个 `gid`。

- `openStatus` 不是数字 `2`：直接 `sendOnly` 下发 `{ en: openStatus }`，需要时附带 `gid`。不先查询，也不新增校验。字符串 `"2"` 不进入 Toggle。
- `openStatus === 2`：用同一个 `sid` 和同一个 `gid` 调用 `sendAndAwait` 做 `get`。响应存在、`code === 0`，且 `en` 经过 `Number()` 后正好是 `0` 或 `1` 时，再 `sendOnly` 下发相反值：`1` 变为 `0`，`0` 变为 `1`。

`Number(true)` 是 `1`、`Number(false)` 是 `0`，因此布尔值也算合法 `en`。协议正常返回的是数字 `0` 或 `1`。

成功路径不调用 `setVariableValues`。

## 失败处理

只有 Toggle 会查询。下列情况打警告并返回，不下发 `set`：

- 没有响应，或 `code` 不是 `0`
- 没有 `en`，或 `en` 为 `null` / `undefined`
- `Number(en)` 不是正好的 `0` 或 `1`（非数字、`2` 及其他数值都无效）

警告文案：

- 冻结：`Freeze toggle skipped: GET freeze did not return a valid en value.`
- 黑屏：`Blackout toggle skipped: GET blackout did not return a valid en value.`

`sendAndAwait` 在超时或发送失败时已经记下警告并返回 `undefined`，不会把异常抛回动作。Toggle 把 `undefined` 当成没有响应，再打上面的 skip 警告后返回。因此一次失败可能有两条警告：传输层一条，动作一条。这与亮度步进相同。

查询成功后的 `set` 直接 `await sendOnly`，与现在的开/关相同：不看返回值重试，也不另加 try/catch。不修改 `SPTransmitter`。失败和成功都不写变量。

## 代码落点

- `_shared.ts`：只新增 `openCloseToggleField`。
- `display.ts`：两个 Set 动作改用该字段，并共用 `sendOpenCloseOrToggle`。
- 不导出该发送函数。本仓库没有测试会引用它。

## 验证

不新增测试框架。改完运行现有的 `npm run build` 做类型检查。

冻结和黑屏各核对一次：

- Open、Close 直接下发 `en=1` 或 `en=0`，不先查询
- Toggle 且当前 `en=0` 时下发 `en=1`
- Toggle 且当前 `en=1` 时下发 `en=0`
- 查询失败，或 `en` 不是 `0`/`1` 时不下发，并打出对应警告
- 勾选广播时，查询和下发都使用 `sid=255`
- 填写了 `gid` 时，查询和下发都带上同一个 `gid`
- `freeze_enable` 和 `blackout_enable` 不被这两条 Set 动作改写
