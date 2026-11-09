const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setupLayerActions } = require('../dist/actions/string-protocol/actions/layers')
const { setupStringActions } = require('../dist/actions/string-protocol/index')

/** U9 names signals by board kind. 0x10 is DVIx4_IN. */
const hdmi = { slotCode: 16, boardKind: 0x10, boardIdx: 0, srcType: 0x20, srcIdx: 2 }
const hdmiId = '16:16:0:32:2'
const slotZero = { slotCode: 0, boardKind: 0x10, boardIdx: 0, srcType: 0x20, srcIdx: 1 }
const slotZeroId = '0:16:0:32:1'

function host(sources) {
  const sent = []
  const writes = []
  const actions = setupLayerActions({
    ctx: {
      config: { protocol: 'B-Protocol' },
      state: { modelByte: 35, inputVideoSources: sources }
    },
    conn: {
      sendOnly: async (cmd, op, sid, data) => {
        sent.push({ cmd, op, sid, data })
        return true
      }
    },
    setVariableValues: () => writes.push('write')
  })
  return { actions, sent, writes }
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
