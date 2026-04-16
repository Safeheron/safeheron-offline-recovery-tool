/* eslint-disable max-classes-per-file */
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
  CSV_FIELD_HD_PATH,
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

  // Expected token count per item, derived from the tp template.
  // e.g. "{blockchain},{network},{type},{at},{path2},{path3},{path4},{path5}" → 8
  const tp = metadata.tp as string | undefined
  const expectedTokenCount = tp ? tp.split(',').length : 8

  const items: ItemDescriptor[] = []

  for (const walletEntry of data as Record<string, { item: string[] }>[]) {
    for (const algoIdxStr of Object.keys(walletEntry)) {
      const algoIdx = parseInt(algoIdxStr, 10)
      const algoName = algorithmDict[algoIdx] as string
      const { item } = walletEntry[algoIdxStr]

      if (!algoName) throw new InvalidFormatError()

      for (const itemStr of item) {
        const tokens = tokenizeItemString(itemStr)
        if (tokens.length < expectedTokenCount) throw new InvalidFormatError()

        const blockchainIdx = parseInt(tokens[0], 10)
        const networkIdx = parseInt(tokens[1], 10)
        const atIdx = parseInt(tokens[3], 10)
        const path2 = parseInt(tokens[4], 10)
        const path4 = parseInt(tokens[6], 10)

        if (Number.isNaN(path2) || Number.isNaN(path4)) throw new InvalidFormatError()

        const blockchain = blockchainDict[blockchainIdx] as string | undefined
        const network = networkDict[networkIdx] as string | undefined
        const addrType = (metadata.at as string[])?.[atIdx]
        if (!blockchain || !network || !addrType) throw new InvalidFormatError()

        let path3Ranges: number[][]
        let path5Ranges: number[][]
        try {
          path3Ranges = JSON.parse(tokens[5])
          path5Ranges = JSON.parse(tokens[7])
        } catch {
          throw new InvalidFormatError()
        }

        items.push({
          algoName,
          blockchain,
          network,
          addrType,
          path2,
          path3Ranges,
          path4,
          path5Ranges,
          accountCount: rangeSize(path3Ranges),
          addrCount: rangeSize(path5Ranges),
        })
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
  CSV_FIELD_HD_PATH,
  CSV_FIELD_ALGO,
]

/**
 * Binary min-heap. Used by expandSortedJsonToTempCsv for k-way merge.
 */
class MinHeap<T> {
  private data: T[] = []

  private cmp: (a: T, b: T) => number

  constructor(cmp: (a: T, b: T) => number) {
    this.cmp = cmp
  }

  get size(): number { return this.data.length }

  push(v: T): void {
    this.data.push(v)
    this.bubbleUp(this.data.length - 1)
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined
    const top = this.data[0]
    const last = this.data.pop() as T
    if (this.data.length > 0) {
      this.data[0] = last
      this.bubbleDown(0)
    }
    return top
  }

  private bubbleUp(startIdx: number): void {
    let i = startIdx
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.cmp(this.data[i], this.data[parent]) < 0) {
        const tmp = this.data[i]
        this.data[i] = this.data[parent]
        this.data[parent] = tmp
        i = parent
      } else break
    }
  }

  private bubbleDown(startIdx: number): void {
    let i = startIdx
    const n = this.data.length
    let moving = true
    while (moving) {
      const l = 2 * i + 1
      const r = 2 * i + 2
      let smallest = i
      if (l < n && this.cmp(this.data[l], this.data[smallest]) < 0) smallest = l
      if (r < n && this.cmp(this.data[r], this.data[smallest]) < 0) smallest = r
      if (smallest === i) {
        moving = false
      } else {
        const tmp = this.data[i]
        this.data[i] = this.data[smallest]
        this.data[smallest] = tmp
        i = smallest
      }
    }
  }
}

type ExpandedRow = { csvLine: string; sourceIdx: number; sortKey: string }

/**
 * Lazily emit rows for one item in sortKey-ascending order.
 * Within a single item: (account asc, addr asc); sortKey pads account so string
 * comparison matches numeric comparison, keeping the stream monotonic for k-way merge.
 */
function* itemRowStream(item: ItemDescriptor, startSourceIdx: number): Generator<ExpandedRow> {
  const accountIndices = expandRanges(item.path3Ranges)
  const addressIndices = expandRanges(item.path5Ranges)
  let sourceIdx = startSourceIdx
  for (const accountIdx of accountIndices) {
    const parentPath = `m/44/${item.path2}/${accountIdx}/${item.path4}`
    const paddedAccount = String(accountIdx).padStart(10, '0')
    const paddedParent = `m/44/${item.path2}/${paddedAccount}/${item.path4}`
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
      yield {
        csvLine,
        sourceIdx: sourceIdx++,
        sortKey: `${item.algoName}\x00${paddedParent}\x00${String(addressIdx).padStart(10, '0')}`,
      }
    }
  }
}

/**
 * Expand JSON backup into a sorted temp CSV.
 *
 * Output format (INTERNAL — not a valid CSV for external consumers):
 *   - First line: plain CSV header (no prefix).
 *   - Data lines: `<sourceIdx>\t<csvFields>` where sourceIdx is the row's
 *     position in the original (user-visible) expansion order. The tab prefix
 *     lets the downstream pipeline carry sourceIdx through derive and restore
 *     the original order at the end without a separate mapping sidecar file.
 *
 * Approach: each item produces its rows in order via a generator; a min-heap
 * does k-way merge across all items, streaming the merged output to disk
 * without ever materializing the full row set. Peak memory: heap (k items) +
 * one write batch (5000 rows), typically under 1 MB regardless of input size.
 *
 * Emits progress via `onProgress(emitted, total)` on every flush boundary
 * (every ~5000 rows).
 */
export async function expandSortedJsonToTempCsv(
  jsonText: string,
  onProgress?: (emitted: number, total: number) => void,
): Promise<{ tempPath: string; totalRows: number }> {
  const { items } = parseItemDescriptors(jsonText)

  // Precompute each item's starting sourceIdx (cumulative row count).
  const itemStarts: number[] = []
  let offset = 0
  for (const item of items) {
    itemStarts.push(offset)
    offset += item.accountCount * item.addrCount
  }
  const totalRows = offset

  // Yield so caller's UI can update before the heavy work starts.
  const yieldTick = () => new Promise<void>(r => { setTimeout(r, 0) })
  await yieldTick()
  onProgress?.(0, totalRows)

  // Create lazy iterators and seed the heap with each's first row.
  type HeapEntry = ExpandedRow & { iterIdx: number }
  const iterators = items.map((item, i) => itemRowStream(item, itemStarts[i]))
  const heap = new MinHeap<HeapEntry>((a, b) => {
    if (a.sortKey < b.sortKey) return -1
    if (a.sortKey > b.sortKey) return 1
    return 0
  })
  for (let i = 0; i < iterators.length; i++) {
    const { value, done } = iterators[i].next()
    if (!done) heap.push({ ...value, iterIdx: i })
  }

  // Prepare output file with header (plain, no prefix).
  const tempPath = await getTempPath()
  await writeFileChunk(tempPath, `${CSV_COLUMNS.join(',')}\n`, false)

  // K-way merge; flush every CHUNK_ROWS rows. Each flush awaits IPC (which
  // yields to the event loop), so no explicit yieldTick is needed here.
  const CHUNK_ROWS = 5000
  const outBuf: string[] = []
  let emitted = 0

  const flush = async () => {
    if (outBuf.length === 0) return
    const chunk = `${outBuf.join('\n')}\n`
    await writeFileChunk(tempPath, chunk, true)
    outBuf.length = 0
    onProgress?.(emitted, totalRows)
  }

  while (heap.size > 0) {
    const entry = heap.pop() as HeapEntry
    // Inline sourceIdx as tab-prefix; downstream (streamCsvProcess) strips it.
    outBuf.push(`${entry.sourceIdx}\t${entry.csvLine}`)
    emitted++

    const { value, done } = iterators[entry.iterIdx].next()
    if (!done) heap.push({ ...value, iterIdx: entry.iterIdx })

    if (outBuf.length >= CHUNK_ROWS) {
      // eslint-disable-next-line no-await-in-loop
      await flush()
    }
  }
  await flush()
  onProgress?.(totalRows, totalRows)

  return { tempPath, totalRows }
}
