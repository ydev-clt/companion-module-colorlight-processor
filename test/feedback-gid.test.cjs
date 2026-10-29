const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setupFreezeScreenFeedback } = require('../dist/feedbacks/freeze-screen')
const { setupBlackoutFeedback } = require('../dist/feedbacks/blackout')

function context(store) {
  const seen = []
  return {
    seen,
    getVariableValue: (id) => {
      seen.push(id)
      return store[id]
    }
  }
}

function colors(result, on, off) {
  assert.equal(result.bgcolor, on ? on.bgcolor : off.bgcolor)
}

test('freeze and blackout read sg_<gid>_*', () => {
  const freezeCtx = context({ sg_1_freeze_enable: 1, sg_2_freeze_enable: '1' })
  const freeze = setupFreezeScreenFeedback(freezeCtx)
  const missing = setupFreezeScreenFeedback(context({}))
  const blackout = setupBlackoutFeedback(context({ sg_2_blackout_enable: 1 }))
  const blackoutMissing = setupBlackoutFeedback(context({}))

  freeze.callback({ options: {} })
  assert.deepEqual(freezeCtx.seen, ['sg_1_freeze_enable'])

  const on = freeze.callback({ options: { gid: 2, bg: 11, bg_: 22, fg: 1, fg_: 2 } })
  assert.equal(on.bgcolor, 11)
  const onText = freeze.callback({ options: { gid: 2, bg: 11, bg_: 22, fg: 1, fg_: 2 } })
  assert.equal(onText.bgcolor, 11)

  const off = missing.callback({ options: { gid: 2, bg: 11, bg_: 22, fg: 1, fg_: 2 } })
  assert.equal(off.bgcolor, 22)

  const fallbackCtx = context({ sg_1_freeze_enable: 1 })
  const fallback = setupFreezeScreenFeedback(fallbackCtx)
  fallback.callback({ options: { gid: 0, bg: 11, bg_: 22, fg: 1, fg_: 2 } })
  assert.deepEqual(fallbackCtx.seen, ['sg_1_freeze_enable'])

  const blackOn = blackout.callback({ options: { gid: 2, bg: 31, bg_: 42, fg: 1, fg_: 2 } })
  assert.equal(blackOn.bgcolor, 31)
  const blackOff = blackoutMissing.callback({ options: { gid: 2, bg: 31, bg_: 42, fg: 1, fg_: 2 } })
  assert.equal(blackOff.bgcolor, 42)
  colors(blackOn, blackOn, blackOff)
})
