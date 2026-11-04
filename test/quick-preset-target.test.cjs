const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  parseCanvasMode,
  parseGroupIds,
  selectQuickPresetGid
} = require('../dist/actions/string-protocol/actions/quick-preset-target')

test('parseCanvasMode accepts only valid mode 0 or 1', () => {
  assert.equal(parseCanvasMode({ valid: 1, mode: 0 }), 0)
  assert.equal(parseCanvasMode({ valid: 1, mode: 1 }), 1)
  assert.equal(parseCanvasMode({ valid: 0, mode: 1 }), undefined)
  assert.equal(parseCanvasMode({ valid: 1, mode: 2 }), undefined)
})

test('parseGroupIds keeps the first copy of each integer gid', () => {
  assert.deepEqual(parseGroupIds({ groupIds: [2, 2, 1] }), [2, 1])
  assert.equal(parseGroupIds({ groupIds: [1, 1.5] }), undefined)
  assert.equal(parseGroupIds({ groupIds: [] }), undefined)
  assert.equal(parseGroupIds({ groupIds: [0, 1] }), undefined)
})

test('selectQuickPresetGid returns the first canvas of the requested type', () => {
  assert.equal(selectQuickPresetGid(0, [{ gid: 4, canvasType: 1, fieldsValid: 1 }]), 4)
  assert.equal(selectQuickPresetGid(1, [{ gid: 7, canvasType: 2, fieldsValid: 1 }]), 7)
  assert.equal(
    selectQuickPresetGid(0, [
      { gid: 4, canvasType: 1, fieldsValid: 1 },
      { gid: 9, canvasType: 1, fieldsValid: 1 }
    ]),
    4
  )
  assert.equal(selectQuickPresetGid(0, [{ gid: 4, canvasType: 1, fieldsValid: 0 }]), undefined)
  assert.equal(selectQuickPresetGid(1, [{ gid: 4, canvasType: 1, fieldsValid: 1 }]), undefined)
  assert.equal(selectQuickPresetGid(0, [{ gid: 4, canvasType: 0, fieldsValid: 1 }]), undefined)
})
