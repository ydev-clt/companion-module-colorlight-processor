const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setupCanvasActions } = require('../dist/actions/string-protocol/actions/canvas')
const { setupStringActions } = require('../dist/actions/string-protocol/index')

function host(responses) {
  const sent = []
  const writes = []
  const actions = setupCanvasActions({
    ctx: { config: { protocol: 'B-Protocol' }, state: { modelByte: 50 } },
    conn: {
      sendAndAwait: async (cmd, op, sid, data) => {
        sent.push({ cmd, op, sid, data })
        return responses[cmd]
      },
      sendOnly: async (cmd, op, sid, data) => {
        sent.push({ cmd, op, sid, data })
        return true
      }
    },
    setVariableValues: () => writes.push('write')
  })
  return { actions, sent, writes }
}

const device = { deviceId: 1, isSelectAll: false, gid: 1 }
const switcher = { code: 0, data: { mode: 1, valid: 1, gid: 1 } }

test('Take and Cut set only while canvas mode is switcher', async () => {
  const ok = host({ canvas_mode: switcher })
  await ok.actions.string_take.callback({ options: device })
  await ok.actions.string_cut.callback({ options: device })
  assert.deepEqual(ok.sent, [
    { cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'take', op: 'set', sid: 1, data: { gid: 1 } },
    { cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'cut', op: 'set', sid: 1, data: { gid: 1 } }
  ])
  assert.deepEqual(ok.writes, [])

  const blocked = host({ canvas_mode: { code: 0, data: { mode: 0, valid: 1, gid: 1 } } })
  await blocked.actions.string_take.callback({ options: device })
  assert.deepEqual(blocked.sent, [{ cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } }])

  const missing = host({})
  await missing.actions.string_cut.callback({ options: device })
  assert.deepEqual(missing.sent, [{ cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } }])
  assert.deepEqual(missing.writes, [])
})

test('canvas switch copies, and toggles only from 0 or 1', async () => {
  const copy = host({ canvas_mode: switcher })
  await copy.actions.string_canvas_switch_mode_set.callback({ options: { ...device, switchMode: 0 } })
  assert.deepEqual(copy.sent, [
    { cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'canvas_switch_mode', op: 'set', sid: 1, data: { switchMode: 0, gid: 1 } }
  ])

  const toggle = host({
    canvas_mode: switcher,
    canvas_switch_mode: { code: 0, data: { switchMode: 0, valid: 1, gid: 1 } }
  })
  await toggle.actions.string_canvas_switch_mode_set.callback({ options: { ...device, switchMode: 2 } })
  assert.deepEqual(toggle.sent, [
    { cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'canvas_switch_mode', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'canvas_switch_mode', op: 'set', sid: 1, data: { switchMode: 1, gid: 1 } }
  ])

  const invalid = host({
    canvas_mode: switcher,
    canvas_switch_mode: { code: 0, data: { switchMode: 3, valid: 1, gid: 1 } }
  })
  await invalid.actions.string_canvas_switch_mode_set.callback({ options: { ...device, switchMode: 2 } })
  assert.equal(invalid.sent.some((entry) => entry.op === 'set'), false)
  assert.deepEqual(copy.writes, [])
  assert.deepEqual(toggle.writes, [])
  assert.deepEqual(invalid.writes, [])
})

test('low gray toggle flips en and does not read canvas mode', async () => {
  const h = host({ low_gray: { code: 0, data: { en: 1, gid: 1 } } })
  await h.actions.string_low_gray_set.callback({ options: { ...device, enableStatus: 2 } })
  assert.deepEqual(h.sent, [
    { cmd: 'low_gray', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'low_gray', op: 'set', sid: 1, data: { en: 0, gid: 1 } }
  ])
  assert.deepEqual(h.writes, [])
})

test('video sync sends one field group per operation', async () => {
  const h = host({})
  await h.actions.string_vsync_src_set.callback({ options: { ...device, operation: 'source', src: 1 } })
  await h.actions.string_vsync_src_set.callback({
    options: { ...device, operation: 'board', boardSlot: 3, boardKind: 17, boardIdx: 0, srcType: 17, srcIdx: 2 }
  })
  await h.actions.string_vsync_src_set.callback({ options: { ...device, operation: 'fps', fps100: 6000 } })
  await h.actions.string_vsync_src_set.callback({ options: { ...device, operation: 'phase', phaseUs: 100 } })
  assert.deepEqual(h.sent, [
    { cmd: 'vsync_src', op: 'set', sid: 1, data: { src: 1, gid: 1 } },
    {
      cmd: 'vsync_src',
      op: 'set',
      sid: 1,
      data: { boardSlot: 3, boardKind: 17, boardIdx: 0, srcType: 17, srcIdx: 2, gid: 1 }
    },
    { cmd: 'vsync_src', op: 'set', sid: 1, data: { fps100: 6000, gid: 1 } },
    { cmd: 'vsync_src', op: 'set', sid: 1, data: { phaseUs: 100, gid: 1 } }
  ])
  assert.deepEqual(h.writes, [])
})

test('V20 registers the five canvas actions and U9 does not', () => {
  const v20 = Object.keys(
    setupStringActions({ config: { protocol: 'B-Protocol' }, state: { modelByte: 50 } }, {}, () => {})
  )
  for (const id of [
    'string_low_gray_set',
    'string_take',
    'string_cut',
    'string_canvas_switch_mode_set',
    'string_vsync_src_set'
  ]) {
    assert.equal(v20.includes(id), true)
  }
  const u9 = Object.keys(
    setupStringActions({ config: { protocol: 'B-Protocol' }, state: { modelByte: 35 } }, {}, () => {})
  )
  assert.equal(u9.includes('string_take'), false)
  assert.equal(u9.includes('string_low_gray_set'), false)
})
