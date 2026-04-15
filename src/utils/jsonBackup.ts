/* eslint-disable max-classes-per-file */
import { RawCSVRow } from './mpc'
import {
  getTempPath,
  writeFileChunk,
} from './tauriFileIO'
import { escapeCsvField } from './csvLineParser'
import { sanitizeCsvValue } from './csv'
import {
  CSV_FIELD_ADDR_TYPE,
  CSV_FIELD_BLOCKCHAIN,
  CSV_FIELD_NETWORK,
  CSV_FIELD_ADDRESS,
  CSV_REQUIRED_FIELD,
  CSV_FIELD_ALGO,
} from './const'

export class InvalidFormatError extends Error {
  constructor() {
    super('Invalid JSON backup format')
    this.name = 'InvalidFormatError'
  }
}

export class UnsupportedVersionError extends Error {
  constructor(version: string) {
    super(version)
    this.name = 'UnsupportedVersionError'
  }
}

const SUPPORTED_VERSIONS = ['v1']

/**
 * Validate a parsed JSON backup object.
 * Throws typed errors so callers can show specific messages.
 */
export function validateJsonBackup(json: unknown): void {
  if (
    typeof json !== 'object' ||
    json === null ||
    !('metadata' in json) ||
    !('data' in json)
  ) {
    throw new InvalidFormatError()
  }

  const { metadata } = json as { metadata: Record<string, unknown>; data: unknown }

  if (!SUPPORTED_VERSIONS.includes(metadata.v as string)) {
    throw new UnsupportedVersionError(String(metadata.v ?? ''))
  }
}

/**
 * Split an item string by top-level commas only (ignores commas inside [...]).
 * e.g. "0,0,1,0,666,[[3,3]],0,[[0,0]]" → ["0","0","1","0","666","[[3,3]]","0","[[0,0]]"]
 */
export function tokenizeItemString(s: string): string[] {
  const tokens: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '[') depth++
    else if (c === ']') depth--
    else if (c === ',' && depth === 0) {
      tokens.push(s.slice(start, i).trim())
      start = i + 1
    }
  }
  tokens.push(s.slice(start).trim())
  return tokens
}

/**
 * Expand an array of [start, end] ranges into a flat list of integers.
 * e.g. [[0, 2]] → [0, 1, 2]
 * e.g. [[0, 7], [9, 9]] → [0, 1, 2, 3, 4, 5, 6, 7, 9]
 */
export function expandRanges(ranges: number[][]): number[] {
  const result: number[] = []
  for (const [start, end] of ranges) {
    for (let i = start; i <= end; i++) {
      result.push(i)
    }
  }
  return result
}

export interface ItemDescriptor {
  algoName: string
  blockchain: string
  network: string
  addrType: string
  path2: number
  path3Ranges: number[][]
  path4: number
  path5Ranges: number[][]
  startOffset: number
  accountCount: number
  addrCount: number
}

function rangeSize(ranges: number[][]): number {
  let n = 0
  for (const [s, e] of ranges) n += e - s + 1
  return n
}

export function parseItemDescriptors(jsonText: string): { items: ItemDescriptor[]; metadata: Record<string, any> } {
  let json: unknown
  try {
    json = JSON.parse(jsonText)
  } catch {
    throw new InvalidFormatError()
  }
  validateJsonBackup(json)
  const { metadata, data } = json as { metadata: Record<string, any>; data: any }
  const {
    blockchain: blockchainDict,
    network: networkDict,
    algorithm: algorithmDict,
  } = metadata

  const items: ItemDescriptor[] = []
  let offset = 0

  for (const walletEntry of data as Record<string, { item: string[] }>[]) {
    for (const algoIdxStr of Object.keys(walletEntry)) {
      const algoIdx = parseInt(algoIdxStr, 10)
      const algoName = algorithmDict[algoIdx] as string
      const { item } = walletEntry[algoIdxStr]

      for (const itemStr of item) {
        const tokens = tokenizeItemString(itemStr)
        const blockchainIdx = parseInt(tokens[0], 10)
        const networkIdx = parseInt(tokens[1], 10)
        const atIdx = parseInt(tokens[3], 10)
        const path2 = parseInt(tokens[4], 10)
        const path3Ranges: number[][] = JSON.parse(tokens[5])
        const path4 = parseInt(tokens[6], 10)
        const path5Ranges: number[][] = JSON.parse(tokens[7])

        const accountCount = rangeSize(path3Ranges)
        const addrCount = rangeSize(path5Ranges)

        items.push({
          algoName,
          blockchain: blockchainDict[blockchainIdx] as string,
          network: networkDict[networkIdx] as string,
          addrType: (metadata.at as string[])[atIdx],
          path2,
          path3Ranges,
          path4,
          path5Ranges,
          startOffset: offset,
          accountCount,
          addrCount,
        })
        offset += accountCount * addrCount
      }
    }
  }

  return { items, metadata }
}

export function computeJsonRowCount(jsonText: string): number {
  const { items } = parseItemDescriptors(jsonText)
  return items.reduce((sum, item) => sum + item.accountCount * item.addrCount, 0)
}

const CSV_COLUMNS = [
  CSV_FIELD_BLOCKCHAIN,
  CSV_FIELD_NETWORK,
  CSV_FIELD_ADDRESS,
  CSV_FIELD_ADDR_TYPE,
  CSV_REQUIRED_FIELD,
  CSV_FIELD_ALGO,
]

/**
 * Expand JSON backup into a sorted temp CSV + sidecar mapping file.
 *
 * Approach: generate all rows as lightweight { csvLine, sourceIdx, sortKey }
 * structs (~200 bytes/row vs ~700 bytes/row for full RawCSVRow + sort wrapper),
 * sort in memory, then write sequentially. Supports ~8M rows within 2GB heap.
 */
export async function expandSortedJsonToTempCsv(
  jsonText: string,
): Promise<{ tempPath: string; mappingPath: string; totalRows: number }> {
  const { items } = parseItemDescriptors(jsonText)

  // Phase 1: expand all items into lightweight row structs (same iteration as convertJsonBackupToRows).
  // Yield to the event loop every YIELD_INTERVAL rows so the UI stays responsive.
  const YIELD_INTERVAL = 50000
  const yieldTick = () => new Promise<void>(r => { setTimeout(r, 0) })

  // Initial yield so caller's state updates (e.g. "importing..." spinner) render first.
  await yieldTick()

  const rows: Array<{ csvLine: string; sourceIdx: number; sortKey: string }> = []
  let sourceIdx = 0

  for (const item of items) {
    const accountIndices = expandRanges(item.path3Ranges)
    const addressIndices = expandRanges(item.path5Ranges)

    for (const accountIdx of accountIndices) {
      const parentPath = `m/44/${item.path2}/${accountIdx}/${item.path4}`
      for (const addressIdx of addressIndices) {
        const hdPath = `${parentPath}/${addressIdx}`
        const fields = [
          item.blockchain,
          item.network,
          '',
          item.addrType,
          hdPath,
          item.algoName,
        ]
        const csvLine = fields.map(f => escapeCsvField(String(sanitizeCsvValue(f)))).join(',')
        rows.push({
          csvLine,
          sourceIdx,
          sortKey: `${item.algoName}\x00${parentPath}\x00${String(addressIdx).padStart(10, '0')}`,
        })
        sourceIdx++
        if (sourceIdx % YIELD_INTERVAL === 0) {
          // eslint-disable-next-line no-await-in-loop
          await yieldTick()
        }
      }
    }
  }

  // Yield before sort (sort is synchronous, ~1s, unavoidable single block)
  await yieldTick()

  // Phase 2: sort by (algo, parentPath, lastIndex)
  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  // Phase 3: write sorted CSV + mapping file
  const tempPath = await getTempPath()
  const mappingPath = await getTempPath()
  await writeFileChunk(tempPath, `${CSV_COLUMNS.join(',')}\n`, false)
  await writeFileChunk(mappingPath, '', false)

  const CHUNK_ROWS = 5000
  for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
    const slice = rows.slice(i, i + CHUNK_ROWS)
    const csvChunk = `${slice.map(r => r.csvLine).join('\n')}\n`
    const mapChunk = `${slice.map(r => r.sourceIdx).join('\n')}\n`
    // eslint-disable-next-line no-await-in-loop
    await writeFileChunk(tempPath, csvChunk, true)
    // eslint-disable-next-line no-await-in-loop
    await writeFileChunk(mappingPath, mapChunk, true)
  }

  return { tempPath, mappingPath, totalRows: rows.length }
}

export function positionInRanges(ranges: number[][], value: number): number {
  let pos = 0
  for (const [start, end] of ranges) {
    if (value > end) {
      pos += end - start + 1
    } else if (value >= start) {
      return pos + value - start
    } else {
      return -1
    }
  }
  return -1
}

/**
 * Convert a compressed JSON backup file to RawCSVRow[].
 * Address field will be empty string — the JSON backup does not store addresses.
 */
export function convertJsonBackupToRows(jsonText: string): RawCSVRow[] {
  const { items } = parseItemDescriptors(jsonText)
  const rows: RawCSVRow[] = []

  for (const item of items) {
    const accountIndices = expandRanges(item.path3Ranges)
    const addressIndices = expandRanges(item.path5Ranges)

    for (const accountIdx of accountIndices) {
      for (const addressIdx of addressIndices) {
        rows.push({
          [CSV_REQUIRED_FIELD]: `m/44/${item.path2}/${accountIdx}/${item.path4}/${addressIdx}`,
          [CSV_FIELD_NETWORK]: item.network,
          [CSV_FIELD_ADDRESS]: '',
          [CSV_FIELD_ADDR_TYPE]: item.addrType,
          [CSV_FIELD_ALGO]: item.algoName,
          [CSV_FIELD_BLOCKCHAIN]: item.blockchain,
        })
      }
    }
  }

  return rows
}
