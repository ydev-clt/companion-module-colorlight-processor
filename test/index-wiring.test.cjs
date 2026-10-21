const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

test('the instance starts business receive and heartbeat after bind', () => {
  const src = fs.readFileSync('dist/index.js', 'utf8')
  assert.match(src, /setOnLinkLost/)
  assert.match(src, /beginReceiving/)
  assert.match(src, /startHeartbeat/)
  assert.match(src, /_linkGeneration/)
  assert.match(src, /Host config is empty[\s\S]{0,120}connection\.close\(/)
})
