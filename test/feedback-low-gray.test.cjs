const { test } = require('node:test')
const assert = require('node:assert/strict')
const { combineRgb } = require('@companion-module/base')
const { setupLowGrayFeedback } = require('../dist/feedbacks/low-gray')
const { setupVariables } = require('../dist/variables/index')

const white = combineRgb(255, 255, 255)
const amber = combineRgb(180, 120, 0)
const dim = combineRgb(70, 70, 70)

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

function option(definition, id) {
  return definition.options.find((item) => item.id === id)
}

test('low gray feedback reads screen group 1 and has no gid option', () => {
  const ctx = context({ sg_1_low_gray_enable: 1 })
  const definition = setupLowGrayFeedback(ctx)

  assert.equal(definition.options.some((item) => item.id === 'gid'), false)
  assert.equal(option(definition, 'fg').default, white)
  assert.equal(option(definition, 'bg').default, amber)
  assert.equal(option(definition, 'fg_').default, white)
  assert.equal(option(definition, 'bg_').default, dim)

  const on = definition.callback({ options: { gid: 1, bg: 11, bg_: 22, fg: 1, fg_: 2 } })
  assert.deepEqual(ctx.seen, ['sg_1_low_gray_enable'])
  assert.equal(on.bgcolor, 11)
  assert.equal(on.color, 1)

  const onText = setupLowGrayFeedback(context({ sg_1_low_gray_enable: '1' })).callback({
    options: { bg: 11, bg_: 22, fg: 1, fg_: 2 }
  })
  assert.equal(onText.bgcolor, 11)
  assert.equal(onText.color, 1)

  for (const value of [0, '0', undefined]) {
    const store = {}
    if (value !== undefined) store.sg_1_low_gray_enable = value
    const off = setupLowGrayFeedback(context(store)).callback({
      options: { bg: 11, bg_: 22, fg: 1, fg_: 2 }
    })
    assert.equal(off.bgcolor, 22)
    assert.equal(off.color, 2)
  }
})

function variableHost() {
  const checks = []
  const context = {
    config: { protocol: 'B-Protocol' },
    state: { modelByte: 50 },
    checkFeedbacks: (id) => checks.push(id),
    setVariableDefinitions() {},
    setVariableValues() {}
  }
  const installed = setupVariables(context, () => ({ slots: [], groupListKnown: false }))
  return { checks, setVariableValues: installed.setVariableValues }
}

test('writing sg_1_low_gray_enable refreshes only the low gray feedback', () => {
  const lowGray = variableHost()
  lowGray.setVariableValues({ sg_1_low_gray_enable: 1 })
  assert.deepEqual(lowGray.checks, ['string_low_gray_feedback'])

  const otherGroup = variableHost()
  otherGroup.setVariableValues({ sg_2_low_gray_enable: 1 })
  assert.deepEqual(otherGroup.checks, [])

  const freeze = variableHost()
  freeze.setVariableValues({ sg_1_freeze_enable: 1 })
  assert.deepEqual(freeze.checks, ['string_freeze_feedback'])

  const blackout = variableHost()
  blackout.setVariableValues({ sg_2_blackout_enable: 1 })
  assert.deepEqual(blackout.checks, ['string_blackout_feedback'])
})
