import type { DropdownChoice } from '@companion-module/base'
import { inputSignalName } from './input-board-names'

/**
 * One input signal discovered for video-sync and later video-source actions.
 * `slotCode` is the probe slot; `vsync_src` calls the same number `boardSlot`.
 */
export interface InputVideoSource {
  slotCode: number
  boardKind: number
  boardIdx: number
  srcType: number
  srcIdx: number
}

/** One input board returned by `pr_vin_board`, before its signals are probed. */
export interface InputBoardRef {
  slotCode: number
  boardKind: number
  boardIdx: number
}

const BOARD_LIST_KEYS = ['boards', 'boardList', 'vinBoards', 'items', 'list'] as const

/**
 * Read a non-negative integer. Protocol fields arrive as numbers; a fractional
 * value is rejected rather than silently truncated into the wrong slot.
 */
function nonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return undefined
  return value
}

/** First present integer among the names a firmware revision might use. */
function firstInt(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = nonNegativeInt(record[key])
    if (value !== undefined) return value
  }
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/**
 * Board array inside a `pr_vin_board` body. The public protocol text does not
 * fix the array key, so the known list names are accepted, then a bare array.
 */
function boardArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const record = asRecord(data)
  if (!record) return []
  for (const key of BOARD_LIST_KEYS) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return []
}

/**
 * Parse one `pr_vin_board` entry. Slot and board kind are required; a missing
 * board index is 0, which is the only index on a single-board slot.
 */
export function inputBoardFromRecord(value: unknown): InputBoardRef | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const slotCode = firstInt(record, ['slotCode', 'boardSlot', 'slot'])
  const boardKind = firstInt(record, ['boardKind', 'boardType', 'kind'])
  if (slotCode === undefined || boardKind === undefined) return undefined
  const boardIdx = firstInt(record, ['boardIdx', 'boardIndex', 'idx']) ?? 0
  return { slotCode, boardKind, boardIdx }
}

/**
 * Boards from a `pr_vin_board` response. A missing response, a non-zero code,
 * or an unusable body is an empty list. A missing code counts as success,
 * matching the other probe parsers.
 */
export function boardsFromVinBoard(response: { code?: unknown; data?: unknown } | undefined): InputBoardRef[] {
  if (response === undefined) return []
  if (response.code !== undefined && response.code !== 0) return []
  const boards: InputBoardRef[] = []
  for (const item of boardArray(response.data)) {
    const board = inputBoardFromRecord(item)
    if (board) boards.push(board)
  }
  return boards
}

/**
 * Signals on one board from `pr_video`. Each row uses the protocol fields
 * `slotCode`, `boardKind`, `srcType`, and `srcIdx`. A missing slot or kind
 * falls back to the board that was queried. The row does not carry a board
 * index, so that value always comes from the queried board.
 */
export function sourcesFromPrVideo(
  response: { code?: unknown; data?: unknown } | undefined,
  board: InputBoardRef
): InputVideoSource[] {
  if (response === undefined) return []
  if (response.code !== undefined && response.code !== 0) return []
  const data = asRecord(response.data)
  const rows = data && Array.isArray(data.sources) ? data.sources : []
  const sources: InputVideoSource[] = []
  for (const item of rows) {
    const record = asRecord(item)
    if (!record) continue
    const srcType = nonNegativeInt(record.srcType)
    const srcIdx = nonNegativeInt(record.srcIdx)
    if (srcType === undefined || srcIdx === undefined) continue
    sources.push({
      slotCode: nonNegativeInt(record.slotCode) ?? board.slotCode,
      boardKind: nonNegativeInt(record.boardKind) ?? board.boardKind,
      boardIdx: board.boardIdx,
      srcType,
      srcIdx
    })
  }
  return sources
}

/** Stable dropdown id. The button stores this, so a later list refresh still addresses the same signal. */
export function inputVideoSourceChoiceId(source: InputVideoSource): string {
  return `${source.slotCode}:${source.boardKind}:${source.boardIdx}:${source.srcType}:${source.srcIdx}`
}

/** Inverse of `inputVideoSourceChoiceId`. An empty or edited id returns undefined. */
export function inputVideoSourceFromChoiceId(id: string): InputVideoSource | undefined {
  const parts = id.split(':')
  if (parts.length !== 5) return undefined
  const numbers = parts.map((part) => Number(part))
  if (numbers.some((value) => !Number.isInteger(value) || value < 0)) return undefined
  return {
    slotCode: numbers[0],
    boardKind: numbers[1],
    boardIdx: numbers[2],
    srcType: numbers[3],
    srcIdx: numbers[4]
  }
}

/**
 * Dropdown rows for signals returned by a successful probe. No rows are
 * invented before that probe. A signal whose id is missing from the model
 * map is left out. The shown number counts only within the same interface
 * name, in probe order, starting at 1. `srcIdx` stays in the choice id so
 * the set still addresses the probed port.
 */
export function inputVideoSourceChoices(
  sources: readonly InputVideoSource[],
  modelLabel: string | undefined
): DropdownChoice<string>[] {
  /** How many rows of this interface name have already been shown. */
  const countByName = new Map<string, number>()
  const choices: DropdownChoice<string>[] = []
  for (const source of sources) {
    const name = inputSignalName(modelLabel, source)
    if (name === undefined) continue
    const index = (countByName.get(name) ?? 0) + 1
    countByName.set(name, index)
    choices.push({ id: inputVideoSourceChoiceId(source), label: `${name} ${index}` })
  }
  return choices
}

type ProbeGet = (cmd: string, data?: Record<string, number>) => Promise<{ code?: unknown; data?: unknown } | undefined>

/**
 * Discover every input signal and keep the flat list for video sync and the
 * later video-source action.
 *
 * `pr_vin_board` returns the installed boards. Each board is then read with
 * `pr_video`, which is addressed by slot and board kind. A failed signal read
 * skips that board and keeps the signals already collected.
 */
export async function discoverInputVideoSources(
  get: ProbeGet,
  log: (message: string) => void = () => {}
): Promise<InputVideoSource[]> {
  const boardResponse = await get('pr_vin_board')
  const boards = boardsFromVinBoard(boardResponse)
  if (boards.length === 0 && (boardResponse === undefined || boardResponse.code !== 0)) {
    log(`input video sources: pr_vin_board unavailable (code=${String(boardResponse?.code)}).`)
  }
  const sources: InputVideoSource[] = []
  for (const board of boards) {
    const video = await get('pr_video', { slotCode: board.slotCode, boardKind: board.boardKind })
    if (video === undefined || (video.code !== undefined && video.code !== 0)) {
      log(
        `input video sources: pr_video skipped for slot ${board.slotCode} kind ${board.boardKind} (code=${String(video?.code)}).`
      )
      continue
    }
    sources.push(...sourcesFromPrVideo(video, board))
  }
  if (sources.length > 0) return sources
  // Single-board devices accept pr_video with no slot. Use that when the
  // board list is missing or none of its slots returned a signal.
  const video = await get('pr_video')
  if (video === undefined || (video.code !== undefined && video.code !== 0)) {
    log(`input video sources: pr_video returned no signals (code=${String(video?.code)}).`)
    return []
  }
  return sourcesFromPrVideo(video, { slotCode: 0, boardKind: 0, boardIdx: 0 })
}
