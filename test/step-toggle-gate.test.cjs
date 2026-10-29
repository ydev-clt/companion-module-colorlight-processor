const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setupDisplayActions } = require('../dist/actions/string-protocol/actions/display')

function host(modelByte, sendAndAwait) {
  const ops = []
  const writes = []
  const actions = setupDisplayActions({
    ctx: { config: { protocol: 'B-Protocol' }, state: { modelByte } },
    conn: {
      sendAndAwait: sendAndAwait ?? (async (_cmd, op) => {
        ops.push(op)
        return { code: 0, data: { brt: 1000, ct: 6500, en: 1 } }
      }),
      sendOnly: async (_cmd, op) => {
        ops.push(op)
        return true
      }
    },
    setVariableValues: () => writes.push('write')
  })
  return { actions, ops, writes }
}

const base = { deviceId: 1, gid: 1, brightness: 50, brightnessStep: 1, ct: 6500, ctStep: 100 }

test('read-before-write paths skip when get is unsupported and never write variables', async () => {
  const unresolved = host(null)
  await unresolved.actions.string_brightness_set.callback({ options: { ...base, operation: 'step' } })
  assert.deepEqual(unresolved.ops, [])
  await unresolved.actions.string_brightness_set.callback({ options: { ...base, operation: 'set' } })
  assert.deepEqual(unresolved.ops, ['set'])
  await unresolved.actions.string_freeze_set.callback({ options: { ...base, enableStatus: 2 } })
  assert.deepEqual(unresolved.ops, ['set'])
  await unresolved.actions.string_freeze_set.callback({ options: { ...base, enableStatus: 1 } })
  assert.deepEqual(unresolved.ops, ['set', 'set'])
  await unresolved.actions.string_colortemp_set.callback({ options: { ...base, operation: 'step' } })
  assert.deepEqual(unresolved.ops, ['set', 'set'])
  await unresolved.actions.string_blackout_set.callback({ options: { ...base, enableStatus: 2 } })
  assert.deepEqual(unresolved.ops, ['set', 'set'])
  assert.deepEqual(unresolved.writes, [])

  const supported = host(35)
  await supported.actions.string_brightness_set.callback({ options: { ...base, operation: 'step' } })
  assert.deepEqual(supported.ops, ['get', 'set'])
  assert.deepEqual(supported.writes, [])
})
