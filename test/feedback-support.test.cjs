const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setupFeedbacks, filterFeedbacksForDevice } = require('../dist/feedbacks/index')
const { setupFreezeScreenFeedback } = require('../dist/feedbacks/freeze-screen')
const { setupBlackoutFeedback } = require('../dist/feedbacks/blackout')
const { setupLowGrayFeedback } = require('../dist/feedbacks/low-gray')

const FREEZE = 'string_freeze_feedback'
const BLACKOUT = 'string_blackout_feedback'
const LOW_GRAY = 'string_low_gray_feedback'
const SUPPORTED = [BLACKOUT, FREEZE, LOW_GRAY]

function context(protocol, modelByte) {
  return { config: {}, state: { protocol, modelByte } }
}

function sortedKeys(definitions) {
  return Object.keys(definitions).sort()
}

test('resolved V and VX register freeze, blackout, and low gray', () => {
  for (const modelByte of [50, 34]) {
    const keys = sortedKeys(setupFeedbacks(context('B-Protocol', modelByte)))
    assert.deepEqual(keys, SUPPORTED)
  }
})

test('resolved non-V/VX also registers low gray', () => {
  const keys = sortedKeys(setupFeedbacks(context('B-Protocol', 35)))
  assert.deepEqual(keys, SUPPORTED)
})

test('unresolved model and A-Protocol register no feedbacks', () => {
  assert.deepEqual(setupFeedbacks(context('B-Protocol', null)), {})
  assert.deepEqual(setupFeedbacks(context('A-Protocol', 35)), {})
})

test('filter drops an id that has no command mapping', () => {
  const ctx = context('B-Protocol', 50)
  const filtered = filterFeedbacksForDevice(
    {
      [FREEZE]: setupFreezeScreenFeedback(ctx),
      [BLACKOUT]: setupBlackoutFeedback(ctx),
      [LOW_GRAY]: setupLowGrayFeedback(ctx),
      string_unmapped_feedback: { type: 'advanced', name: 'Unmapped' }
    },
    { protocol: 'B-Protocol', modelByte: 50 }
  )
  assert.equal(Object.hasOwn(filtered, 'string_unmapped_feedback'), false)
  assert.deepEqual(sortedKeys(filtered), SUPPORTED)
})
