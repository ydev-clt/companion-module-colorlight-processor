const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setupPresetActions } = require('../dist/actions/string-protocol/actions/presets')

function host(modelByte, reply) {
  const sent = []
  const actions = setupPresetActions({
    ctx: { config: { protocol: 'B-Protocol' }, state: { modelByte } },
    conn: {
      sendAndAwait: async (cmd, op, sid, data) => {
        sent.push({ cmd, op, sid, data })
        return reply(cmd, data)
      },
      sendOnly: async (cmd, op, sid, data) => {
        sent.push({ cmd, op, sid, data })
        return true
      }
    },
    setVariableValues: () => {}
  })
  return { actions, sent }
}

function gidLabel(actions) {
  return actions.string_quick_preset.options.find((option) => option.id === 'gid').label
}

const pgm = { code: 0, data: { gid: 2, canvasType: 1, fieldsValid: 1 } }
const pvw = { code: 0, data: { gid: 1, canvasType: 2, fieldsValid: 1 } }

function replyFor(mode, canvases) {
  return (cmd, data) => {
    if (cmd === 'canvas_mode') return { code: 0, data: { mode, valid: 1, gid: 1 } }
    if (cmd === 'pr_group') return { code: 0, data: { groupCount: 2, groupIds: [1, 2] } }
    if (cmd === 'pr_canvas') return canvases[data.gid]
    return undefined
  }
}

const mode0Gets = [
  { cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } },
  { cmd: 'pr_group', op: 'get', sid: 1, data: undefined },
  { cmd: 'pr_canvas', op: 'get', sid: 1, data: { gid: 1 } },
  { cmd: 'pr_canvas', op: 'get', sid: 1, data: { gid: 2 } }
]

test('V10 and VX20 send qp to the first PGM after a PVW', async () => {
  for (const modelByte of [50, 34]) {
    const run = host(modelByte, replyFor(0, { 1: pvw, 2: pgm }))
    await run.actions.string_quick_preset.callback({
      options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 1 }
    })
    assert.deepEqual(run.sent, [
      ...mode0Gets,
      { cmd: 'qp', op: 'set', sid: 1, data: { preset: 3, gid: 2 } }
    ])
    assert.equal(
      run.actions.string_quick_preset.description,
      'Switch to the specified preset. The gid reads canvas mode; the preset is sent to PGM or PVW.'
    )
    assert.equal(gidLabel(run.actions), 'Canvas mode screen group (gid)')
  }
})

test('switcher mode stops at the first PVW', async () => {
  const run = host(50, replyFor(1, { 1: pvw, 2: pgm }))
  await run.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 1 }
  })
  assert.deepEqual(run.sent, [
    { cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'pr_group', op: 'get', sid: 1, data: undefined },
    { cmd: 'pr_canvas', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'qp', op: 'set', sid: 1, data: { preset: 3, gid: 1 } }
  ])
})

test('select all uses sid 255 for the mode 0 sequence', async () => {
  const run = host(50, replyFor(0, { 1: pvw, 2: pgm }))
  await run.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: true, preset: 3, gid: 1 }
  })
  assert.deepEqual(
    run.sent.map((entry) => entry.sid),
    [255, 255, 255, 255, 255]
  )
  assert.deepEqual(run.sent.at(-1), { cmd: 'qp', op: 'set', sid: 255, data: { preset: 3, gid: 2 } })
})

test('the page gid is not required to be one of the group ids', async () => {
  const run = host(50, replyFor(0, { 1: pvw, 2: pgm }))
  await run.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 5 }
  })
  assert.deepEqual(run.sent, [
    { cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 5 } },
    { cmd: 'pr_group', op: 'get', sid: 1, data: undefined },
    { cmd: 'pr_canvas', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'pr_canvas', op: 'get', sid: 1, data: { gid: 2 } },
    { cmd: 'qp', op: 'set', sid: 1, data: { preset: 3, gid: 2 } }
  ])
})

test('a missing page gid sends nothing', async () => {
  const run = host(50, replyFor(0, { 1: pvw, 2: pgm }))
  await run.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3 }
  })
  assert.deepEqual(run.sent, [])
})

test('canvas mode and group failures stop before qp', async () => {
  const missing = host(50, () => undefined)
  await missing.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 1 }
  })
  assert.deepEqual(missing.sent, [{ cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } }])

  const invalid = host(50, (cmd) => {
    if (cmd === 'canvas_mode') return { code: 0, data: { mode: 0, valid: 0, gid: 1 } }
    return undefined
  })
  await invalid.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 1 }
  })
  assert.deepEqual(invalid.sent, [{ cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } }])

  const emptyGroups = host(50, (cmd) => {
    if (cmd === 'canvas_mode') return { code: 0, data: { mode: 0, valid: 1, gid: 1 } }
    if (cmd === 'pr_group') return { code: 0, data: { groupIds: [] } }
    return undefined
  })
  await emptyGroups.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 1 }
  })
  assert.deepEqual(emptyGroups.sent, [
    { cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'pr_group', op: 'get', sid: 1, data: undefined }
  ])
})

test('a bad first canvas is skipped when the next one is PGM', async () => {
  const badCode = host(
    50,
    replyFor(0, { 1: { code: 1, data: { gid: 1, canvasType: 1, fieldsValid: 1 } }, 2: pgm })
  )
  await badCode.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 1 }
  })
  assert.deepEqual(badCode.sent, [
    ...mode0Gets,
    { cmd: 'qp', op: 'set', sid: 1, data: { preset: 3, gid: 2 } }
  ])

  const badGid = host(50, replyFor(0, { 1: { code: 0, data: { gid: 9, canvasType: 1, fieldsValid: 1 } }, 2: pgm }))
  await badGid.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 1 }
  })
  assert.deepEqual(badGid.sent, [
    ...mode0Gets,
    { cmd: 'qp', op: 'set', sid: 1, data: { preset: 3, gid: 2 } }
  ])
})

test('the first of two PGMs is used and two PVWs send no qp', async () => {
  const firstPgm = { code: 0, data: { gid: 1, canvasType: 1, fieldsValid: 1 } }
  const secondPgm = { code: 0, data: { gid: 2, canvasType: 1, fieldsValid: 1 } }
  const twoPgm = host(50, replyFor(0, { 1: firstPgm, 2: secondPgm }))
  await twoPgm.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 1 }
  })
  assert.deepEqual(twoPgm.sent, [
    { cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'pr_group', op: 'get', sid: 1, data: undefined },
    { cmd: 'pr_canvas', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'qp', op: 'set', sid: 1, data: { preset: 3, gid: 1 } }
  ])

  const firstPvw = { code: 0, data: { gid: 1, canvasType: 2, fieldsValid: 1 } }
  const secondPvw = { code: 0, data: { gid: 2, canvasType: 2, fieldsValid: 1 } }
  const twoPvw = host(50, replyFor(0, { 1: firstPvw, 2: secondPvw }))
  await twoPvw.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 1 }
  })
  assert.deepEqual(twoPvw.sent, mode0Gets)
})

test('U9 Max still sends the page gid and keeps the old label', async () => {
  const run = host(35, () => {
    throw new Error('U9 must not query canvas commands')
  })
  await run.actions.string_quick_preset.callback({
    options: { deviceId: 1, isSelectAll: false, preset: 3, gid: 4 }
  })
  assert.deepEqual(run.sent, [{ cmd: 'qp', op: 'set', sid: 1, data: { preset: 3, gid: 4 } }])
  assert.equal(run.actions.string_quick_preset.description, 'Switch to the specified preset.')
  assert.equal(gidLabel(run.actions), 'Screen group ID (gid)')
})
