const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

test('the instance subscribes before heartbeat and applies push values', () => {
  const src = fs.readFileSync('dist/index.js', 'utf8')
  assert.match(src, /setOnLinkLost/)
  assert.match(src, /_linkGeneration/)
  assert.match(src, /Host config is empty[\s\S]{0,120}connection\.close\(/)
  assert.match(src, /runInitialPoll/)
  assert.match(src, /valuesFromPush/)
  assert.match(
    src,
    /setOnPush\([\s\S]*beginReceiving\(\)[\s\S]*subscribePush\(\)[\s\S]*_linkGeneration[\s\S]*startHeartbeat\([\s\S]*_startInitialPoll\(/
  )
  assert.match(src, /push \$\{cmd\} code=\$\{code\} ignored/)
  assert.match(src, /comm_obj subscribe was not sent; continuing with heartbeat and initial poll/)
})
