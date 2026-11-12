const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  boardsFromVinBoard,
  discoverInputVideoSources,
  inputVideoSourceChoices,
  sourcesFromPrVideo
} = require('../dist/common/input-video-sources')
const { fpsToFps100, vsyncSrcSetSteps } = require('../dist/actions/string-protocol/actions/canvas')

const board = { slotCode: 16, boardKind: 0x18, boardIdx: 0 }

test('pr_vin_board accepts the board list and skips a failed response', () => {
  assert.deepEqual(
    boardsFromVinBoard({
      code: 0,
      data: {
        boards: [
          { slotCode: 16, boardKind: 24, boardIdx: 1 },
          { boardKind: 1 },
          { slotCode: 3, boardSlot: 9, boardKind: 17 }
        ]
      }
    }),
    [
      { slotCode: 16, boardKind: 24, boardIdx: 1 },
      { slotCode: 3, boardKind: 17, boardIdx: 0 }
    ]
  )
  assert.deepEqual(boardsFromVinBoard(undefined), [])
  assert.deepEqual(boardsFromVinBoard({ code: 9010, data: { boards: [{ slotCode: 1, boardKind: 1 }] } }), [])
})

test('pr_video keeps the queried board index when the signal row omits it', () => {
  assert.deepEqual(
    sourcesFromPrVideo(
      {
        code: 0,
        data: {
          srcTotal: 2,
          sources: [
            { slotCode: 16, boardKind: 0x18, srcType: 0x20, srcIdx: 1 },
            { srcType: 0x22, srcIdx: 2 }
          ]
        }
      },
      { ...board, boardIdx: 2 }
    ),
    [
      { slotCode: 16, boardKind: 0x18, boardIdx: 2, srcType: 0x20, srcIdx: 1 },
      { slotCode: 16, boardKind: 0x18, boardIdx: 2, srcType: 0x22, srcIdx: 2 }
    ]
  )
  assert.deepEqual(sourcesFromPrVideo({ code: 0, data: { sources: [] } }, board), [])
  assert.deepEqual(
    sourcesFromPrVideo(
      { code: 0, data: { sources: [{ videoType: 0x20, videoIdx: 1, boardSlot: 9, boardType: 1 }] } },
      board
    ),
    []
  )
})

test('discovery walks every board and skips a failed signal read', async () => {
  const calls = []
  const sources = await discoverInputVideoSources(async (cmd, data) => {
    calls.push({ cmd, data })
    if (cmd === 'pr_vin_board') {
      return {
        code: 0,
        data: {
          boards: [
            { slotCode: 16, boardKind: 24 },
            { boardSlot: 20, boardKind: 38, boardIdx: 1 }
          ]
        }
      }
    }
    if (data.slotCode === 20) return undefined
    return { code: 0, data: { sources: [{ srcType: 32, srcIdx: 1 }] } }
  })
  assert.deepEqual(calls, [
    { cmd: 'pr_vin_board', data: undefined },
    { cmd: 'pr_video', data: { slotCode: 16, boardKind: 24 } },
    { cmd: 'pr_video', data: { slotCode: 20, boardKind: 38 } }
  ])
  assert.deepEqual(sources, [{ slotCode: 16, boardKind: 24, boardIdx: 0, srcType: 32, srcIdx: 1 }])
})

test('labels number each video interface from 1 on its own', () => {
  const signal = { slotCode: 16, boardKind: 0x18, boardIdx: 0, srcType: 0x20, srcIdx: 1 }
  assert.equal(inputVideoSourceChoices([signal], 'VX20')[0].label, 'HDMI2.0_IN 1')
  assert.equal(inputVideoSourceChoices([{ ...signal, srcType: 0x22 }], 'VX20')[0].label, '12G_SDI_IN 1')
  assert.equal(inputVideoSourceChoices([{ ...signal, srcType: 0x21 }], 'VX20')[0].label, 'DP1.4_IN 1')
  assert.equal(inputVideoSourceChoices([{ ...signal, srcType: 0x11 }], 'VX20')[0].label, 'HDMI1.4_IN 1')
  assert.equal(inputVideoSourceChoices([{ ...signal, srcType: 0x25 }], 'VX20')[0].label, 'MOSAIC_IN 1')
  assert.equal(inputVideoSourceChoices([{ ...signal, srcType: 0x21 }], 'V10')[0].label, 'DP1.4_IN 1')
  assert.deepEqual(inputVideoSourceChoices([{ ...signal, srcType: 0x40 }], 'V20'), [])
  assert.deepEqual(inputVideoSourceChoices([{ ...signal, srcType: 0x41 }], 'V10'), [])
  assert.deepEqual(inputVideoSourceChoices([{ ...signal, srcType: 0x11 }], 'V10'), [])
  assert.equal(inputVideoSourceChoices([signal], 'U9 Max')[0].label, 'MIXx8_IN 1')
  assert.equal(inputVideoSourceChoices([{ ...signal, boardKind: 0x11 }], 'U15')[0].label, 'HDMI1.3x4_IN 1')
  assert.equal(inputVideoSourceChoices([{ ...signal, boardKind: 0x12 }], 'U6 Max')[0].label, '2INI1_IN 1')
  assert.deepEqual(inputVideoSourceChoices([{ ...signal, boardKind: 0x3b }], 'U15'), [])
  assert.deepEqual(inputVideoSourceChoices([signal], 'Z8'), [])
  const mixed = inputVideoSourceChoices(
    [signal, { ...signal, slotCode: 17, srcType: 0x40 }, { ...signal, slotCode: 18, srcType: 0x22 }],
    'VX20'
  )
  assert.deepEqual(
    mixed.map((choice) => choice.label),
    ['HDMI2.0_IN 1', '12G_SDI_IN 1']
  )
  const ports = inputVideoSourceChoices(
    [
      { ...signal, srcType: 0x20, srcIdx: 1 },
      { ...signal, srcType: 0x21, srcIdx: 1 }
    ],
    'VX20'
  )
  assert.deepEqual(
    ports.map((choice) => choice.label),
    ['HDMI2.0_IN 1', 'DP1.4_IN 1']
  )
  const repeated = inputVideoSourceChoices(
    [
      { ...signal, slotCode: 16, srcType: 0x22, srcIdx: 1 },
      { ...signal, slotCode: 17, srcType: 0x22, srcIdx: 2 },
      { ...signal, slotCode: 18, srcType: 0x20, srcIdx: 3 },
      { ...signal, slotCode: 19, srcType: 0x20, srcIdx: 4 }
    ],
    'VX20'
  )
  assert.deepEqual(
    repeated.map((choice) => choice.label),
    ['12G_SDI_IN 1', '12G_SDI_IN 2', 'HDMI2.0_IN 1', 'HDMI2.0_IN 2']
  )
  assert.deepEqual(
    repeated.map((choice) => choice.id),
    ['16:24:0:34:1', '17:24:0:34:2', '18:24:0:32:3', '19:24:0:32:4']
  )
  assert.deepEqual(inputVideoSourceChoices([], 'VX20'), [])
})

test('video sync sends src first, then the matching detail', () => {
  assert.equal(fpsToFps100(60), 6000)
  assert.equal(fpsToFps100(59.94), 5994)
  assert.equal(fpsToFps100(-1), undefined)
  assert.deepEqual(vsyncSrcSetSteps({ src: 'genlock', gid: 1 }), [{ gid: 1, src: 1 }])
  assert.deepEqual(vsyncSrcSetSteps({ src: 'internal', fps: 50, gid: 2 }), [
    { gid: 2, src: 2 },
    { gid: 2, fps100: 5000 }
  ])
  assert.equal(vsyncSrcSetSteps({ src: 'internal', fps: Number.NaN }), undefined)
  assert.deepEqual(vsyncSrcSetSteps({ src: 'input', inputSource: '3:17:0:17:2' }), [
    { src: 0 },
    { boardSlot: 3, boardKind: 17, boardIdx: 0, srcType: 17, srcIdx: 2 }
  ])
  assert.deepEqual(vsyncSrcSetSteps({ src: 'input', inputSource: '3:17:0:17:2', phaseUs: 100, gid: 1 }), [
    { gid: 1, src: 0 },
    { gid: 1, boardSlot: 3, boardKind: 17, boardIdx: 0, srcType: 17, srcIdx: 2 },
    { gid: 1, phaseUs: 100 }
  ])
  assert.equal(vsyncSrcSetSteps({ src: 'input', inputSource: '' }), undefined)
})
