const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ALL_CMDS, isCmd } = require('../dist/common/commands')
const { ACTION_CMD } = require('../dist/actions/string-protocol/core/action-cmds')
const { CMD_SUPPORT } = require('../dist/common/cmd-support')
const { INITIAL_DEVICE_COMMANDS, INITIAL_SCREEN_COMMANDS, POLL_CATALOG } = require('../dist/variables/initial/catalog')
const { VARIABLE_GROUPS } = require('../dist/variables/core/registry')
const { V_VX_SCREEN_COMMANDS } = require('../dist/variables/screen-groups')

const known = new Set(ALL_CMDS)

test('the command catalog is non-empty and rejects unknown names', () => {
  assert.equal(known.size > 0, true)
  assert.equal(isCmd('bright'), true)
  assert.equal(isCmd('pr_group'), true)
  assert.equal(isCmd('not-a-cmd'), false)
})

test('every action mapping points at a known command', () => {
  for (const [actionId, cmd] of Object.entries(ACTION_CMD)) {
    if (cmd === 'always') continue
    assert.equal(known.has(cmd), true, `${actionId} -> ${cmd}`)
  }
})

test('the poll catalog and its initial lists use known commands', () => {
  for (const entry of POLL_CATALOG) assert.equal(known.has(entry.cmd), true, entry.cmd)
  for (const cmd of [...INITIAL_SCREEN_COMMANDS, ...INITIAL_DEVICE_COMMANDS]) {
    assert.equal(known.has(cmd), true, cmd)
  }
})

test('the variable registry and V/VX plan use known commands', () => {
  for (const group of VARIABLE_GROUPS) assert.equal(known.has(group.cmd), true, group.cmd)
  for (const cmd of V_VX_SCREEN_COMMANDS) assert.equal(known.has(cmd), true, cmd)
})

test('every initial poll command has a support matrix row', () => {
  for (const cmd of [...INITIAL_SCREEN_COMMANDS, ...INITIAL_DEVICE_COMMANDS]) {
    assert.notEqual(CMD_SUPPORT[cmd], undefined, cmd)
  }
})
