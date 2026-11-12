const { test } = require('node:test')
const assert = require('node:assert/strict')
const { defaultConfig, generateConfigFields, normalizeConfig } = require('../dist/config')

test('the default config has host and port but no protocol', () => {
  assert.deepEqual(defaultConfig, { host: '192.168.1.10', port: 9999 })
})

test('a numeric string port is normalized and the host is trimmed', () => {
  assert.deepEqual(normalizeConfig({ host: ' 10.0.0.5 ', port: '9999' }), {
    config: { host: '10.0.0.5', port: 9999 }
  })
})

test('an empty host is reported', () => {
  const result = normalizeConfig({ host: '   ', port: 9999 })
  assert.equal(result.error, 'Host config is empty.')
  assert.deepEqual(result.config, { host: '', port: 9999 })
})

test('a port outside 1-65535 is reported and falls back to the default', () => {
  for (const port of [0, -1, 65536, 'abc']) {
    const result = normalizeConfig({ host: '10.0.0.5', port })
    assert.equal(typeof result.error, 'string')
    assert.deepEqual(result.config, { host: '10.0.0.5', port: defaultConfig.port })
  }
})

test('the config UI only exposes host and port', () => {
  assert.deepEqual(
    generateConfigFields().map((field) => field.id),
    ['host', 'port']
  )
})
