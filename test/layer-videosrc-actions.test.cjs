const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setupLayerActions } = require('../dist/actions/string-protocol/actions/layers')
const { setupStringActions } = require('../dist/actions/string-protocol/index')

/** U9 names signals by board kind. 0x10 is DVIx4_IN. */
const hdmi = { slotCode: 16, boardKind: 0x10, boardIdx: 0, srcType: 0x20, srcIdx: 2 }
const hdmiId = '16:16:0:32:2'
const slotZero = { slotCode: 0, boardKind: 0x10, boardIdx: 0, srcType: 0x20, srcIdx: 1 }
const slotZeroId = '0:16:0:32:1'

function host(sources, modelByte = 35, reply) {
  const sent = []
  const writes = []
  const actions = setupLayerActions({
    ctx: {
      config: { protocol: 'B-Protocol' },
      state: { modelByte, inputVideoSources: sources }
    },
    conn: {
      sendAndAwait: async (cmd, op, sid, data) => {
        sent.push({ cmd, op, sid, data })
        return reply ? reply(cmd, data) : undefined
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

function gidOption(actions) {
  return actions.string_videosrc_set.options.find((option) => option.id === 'gid')
}

const pgm = { code: 0, data: { gid: 2, canvasType: 1, fieldsValid: 1 } }
const pvw = { code: 0, data: { gid: 1, canvasType: 2, fieldsValid: 1 } }

function replyFor(mode, canvases, groupIds = [1, 2]) {
  return (cmd, data) => {
    if (cmd === 'pr_group') return { code: 0, data: { groupCount: groupIds.length, groupIds } }
    if (cmd === 'canvas_mode') return { code: 0, data: { mode, valid: 1, gid: data.gid } }
    if (cmd === 'pr_canvas') return canvases[data.gid]
    return undefined
  }
}

test('layer video source sends the probed signal once', async () => {
  const h = host([hdmi, slotZero])
  const input = h.actions.string_videosrc_set.options.find((field) => field.id === 'inputSource')
  assert.deepEqual(
    input.choices.map((choice) => choice.id),
    [hdmiId, slotZeroId]
  )
  assert.equal(input.choices[0].label, 'DVIx4_IN 1')

  await h.actions.string_videosrc_set.callback({
    options: { deviceId: 1, isSelectAll: false, layer: 2, inputSource: hdmiId, gid: 3 }
  })
  await h.actions.string_videosrc_set.callback({
    options: { deviceId: 4, isSelectAll: true, layer: 1, inputSource: slotZeroId, gid: 1 }
  })
  assert.deepEqual(h.sent, [
    { cmd: 'videosrc', op: 'set', sid: 1, data: { layer: 2, src: 2, slotCode: 16, gid: 3 } },
    { cmd: 'videosrc', op: 'set', sid: 255, data: { layer: 1, src: 1, slotCode: 0, gid: 1 } }
  ])
  assert.deepEqual(h.writes, [])
  assert.equal(gidOption(h.actions).label, 'Screen group ID (gid)')
})

test('layer video source skips a selection that is not in the current list', async () => {
  const missing = host([hdmi])
  await missing.actions.string_videosrc_set.callback({
    options: { deviceId: 1, isSelectAll: false, layer: 1, inputSource: slotZeroId, gid: 1 }
  })
  await missing.actions.string_videosrc_set.callback({
    options: { deviceId: 1, isSelectAll: false, layer: 1, inputSource: '', gid: 1 }
  })
  assert.deepEqual(missing.sent, [])
  assert.deepEqual(missing.writes, [])

  const empty = host([])
  const input = empty.actions.string_videosrc_set.options.find((field) => field.id === 'inputSource')
  assert.deepEqual(input.choices, [])
  await empty.actions.string_videosrc_set.callback({
    options: { deviceId: 1, isSelectAll: false, layer: 1, inputSource: hdmiId, gid: 1 }
  })
  assert.deepEqual(empty.sent, [])
})

test('V10 and VX20 send the layer signal to the canvas selected by mode', async () => {
  const mode0Gets = [
    { cmd: 'pr_group', op: 'get', sid: 1, data: undefined },
    { cmd: 'canvas_mode', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'pr_canvas', op: 'get', sid: 1, data: { gid: 1 } },
    { cmd: 'pr_canvas', op: 'get', sid: 1, data: { gid: 2 } }
  ]
  for (const modelByte of [50, 34]) {
    const run = host([hdmi], modelByte, replyFor(0, { 1: pvw, 2: pgm }))
    assert.equal(gidOption(run.actions), undefined)
    assert.equal(
      run.actions.string_videosrc_set.description,
      'According to the current canvas mode, change the layer video source on PGM or PVW.'
    )
    await run.actions.string_videosrc_set.callback({
      options: { deviceId: 1, isSelectAll: false, layer: 2, inputSource: hdmiId, gid: 9 }
    })
    assert.deepEqual(run.sent, [
      ...mode0Gets,
      { cmd: 'videosrc', op: 'set', sid: 1, data: { layer: 2, src: 2, slotCode: 16, gid: 2 } }
    ])
  }

  const switcher = host([hdmi], 50, replyFor(1, { 1: pvw, 2: pgm }))
  await switcher.actions.string_videosrc_set.callback({
    options: { deviceId: 1, isSelectAll: true, layer: 2, inputSource: hdmiId, gid: 9 }
  })
  assert.deepEqual(switcher.sent, [
    { cmd: 'pr_group', op: 'get', sid: 255, data: undefined },
    { cmd: 'canvas_mode', op: 'get', sid: 255, data: { gid: 1 } },
    { cmd: 'pr_canvas', op: 'get', sid: 255, data: { gid: 1 } },
    { cmd: 'videosrc', op: 'set', sid: 255, data: { layer: 2, src: 2, slotCode: 16, gid: 1 } }
  ])
})

test('V10 skips the layer signal when canvas mode has no target', async () => {
  const missing = host([hdmi], 50, () => undefined)
  await missing.actions.string_videosrc_set.callback({
    options: { deviceId: 1, isSelectAll: false, layer: 2, inputSource: hdmiId, gid: 1 }
  })
  assert.deepEqual(missing.sent, [{ cmd: 'pr_group', op: 'get', sid: 1, data: undefined }])

  const noPgm = host([hdmi], 50, replyFor(0, { 1: pvw, 2: pvw }))
  await noPgm.actions.string_videosrc_set.callback({
    options: { deviceId: 1, isSelectAll: false, layer: 2, inputSource: hdmiId, gid: 1 }
  })
  assert.equal(
    noPgm.sent.some((entry) => entry.cmd === 'videosrc'),
    false
  )

  const stale = host([hdmi], 50, replyFor(0, { 1: pvw, 2: pgm }))
  await stale.actions.string_videosrc_set.callback({
    options: { deviceId: 1, isSelectAll: false, layer: 2, inputSource: slotZeroId, gid: 1 }
  })
  assert.deepEqual(stale.sent, [])
})

test('U9 and V20 register layer video source and an unresolved model does not', () => {
  const registered = (modelByte) =>
    Object.keys(
      setupStringActions(
        { config: { protocol: 'B-Protocol' }, state: { modelByte, inputVideoSources: [] } },
        {},
        () => {}
      )
    )
  assert.equal(registered(35).includes('string_videosrc_set'), true)
  assert.equal(registered(51).includes('string_videosrc_set'), true)
  assert.equal(registered(null).includes('string_videosrc_set'), false)
})
