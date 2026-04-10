import {
  LIQUID_CHAIN,
  LIQUID_TEST_CHAIN,
} from './const'
import { MissRequiredFieldError, MissDataError } from './csv'
import { ValidateAddressError, DerivedCSVRow } from './mpc'
import {
  getFileSize,
  readFileChunk,
  writeFileChunk,
  CHUNK_READ_SIZE,
} from './tauriFileIO'
import { parseCsvHeader, escapeCsvField, splitCsvFields } from './csvLineParser'
import type { CsvHeaderInfo } from './csvLineParser'

// Re-export for consumers that imported from here
export { parseCsvHeader, parseCsvLine } from './csvLineParser'
export type { CsvHeaderInfo } from './csvLineParser'

/**
 * Split text into CSV logical lines, respecting quoted fields that contain newlines.
 * Returns [completeLines[], leftover] where leftover may contain an incomplete quoted field.
 */
function splitCsvLines(text: string): [string[], string] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '""'
          i += 1
        } else {
          inQuotes = false
          current += ch
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
      current += ch
    } else if (ch === '\n') {
      lines.push(current.replace(/\r$/, ''))
      current = ''
    } else {
      current += ch
    }
  }

  // If still inside quotes, current is an incomplete record (leftover)
  // If not in quotes, current is also leftover (may be last line without trailing newline)
  return [lines, current]
}

// --- Streaming pipeline orchestrator ---

const BATCH_SIZE = 2000

export interface StreamProgress {
  phase: 'parse' | 'derive' | 'write'
  percent: number // 0-100
}

export interface StreamResult {
  ed25519Chains: string[]
}

const ED25519_CHAIN_SET = new Set([
  'ton', 'ton_testnet', 'ton testnet', 'near', 'aptos', 'sui', 'solana',
])

function isLiquidChain(chainLower: string): boolean {
  return chainLower === LIQUID_CHAIN || chainLower === LIQUID_TEST_CHAIN
}

// How many batches a worker processes before being recycled to reset V8 heap
const WORKER_RECYCLE_INTERVAL = 20

/**
 * Create and init a single worker. Returns a promise that resolves when init-done.
 */
function createSingleWorker(
  mnemonics: string[],
  chainCode: string,
  loadWasm: boolean
): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/deriveWorker.ts', import.meta.url)
    )

    worker.onmessage = e => {
      if (e.data.type === 'init-done') resolve(worker)
      else if (e.data.type === 'init-error') {
        worker.terminate()
        reject(new Error(e.data.error))
      }
    }

    worker.onerror = err => {
      worker.terminate()
      reject(new Error(`Worker init error: ${err.message}`))
    }

    worker.postMessage({ type: 'init', mnemonics, chainCode, hasLiquid: loadWasm })
  })
}

/**
 * Create N workers. Worker 0 loads WASM if hasLiquid.
 */
async function createWorkers(
  count: number,
  mnemonics: string[],
  chainCode: string,
  hasLiquid: boolean
): Promise<Worker[]> {
  const promises = Array.from({ length: count }, (_, i) =>
    createSingleWorker(mnemonics, chainCode, hasLiquid && i === 0)
  )
  return Promise.all(promises)
}

function batchToCsvChunk(rows: DerivedCSVRow[], columns: string[]): string {
  return `${rows
    .map(row => columns.map(col => escapeCsvField((row as Record<string, string>)[col] ?? '')).join(','))
    .join('\n')}\n`
}

export async function streamCsvProcess(
  filePath: string,
  outputPath: string,
  mnemonics: string[],
  chainCode: string,
  onProgress: (progress: StreamProgress) => void
): Promise<StreamResult> {
  const tStart = performance.now()
  const fileSize = await getFileSize(filePath)
  const workerCount = Math.max((navigator.hardwareConcurrency || 4) - 2, 2)

  // === Phase 1: Parse — sequential batching, preserve source order ===
  const tParse = performance.now()
  let offset = 0
  let leftover = ''
  let headerLine = ''
  let totalRowsParsed = 0
  let hasLiquid = false
  let headerParsed = false
  let header: CsvHeaderInfo | null = null
  const ed25519ChainNames = new Set<string>()

  // Sequential batches, each tagged with whether it contains liquid rows
  const batchQueue: { lines: string; rowCount: number; hasLiquid: boolean }[] = []
  let currentLines: string[] = []
  let currentBatchHasLiquid = false

  while (offset < fileSize) {
    const chunkSize = Math.min(CHUNK_READ_SIZE, fileSize - offset)
    // eslint-disable-next-line no-await-in-loop
    const { text: chunk, bytesRead } = await readFileChunk(filePath, offset, chunkSize)
    offset += bytesRead

    const combined = leftover + chunk
    const [completeLines, remainder] = splitCsvLines(combined)
    leftover = remainder

    for (const line of completeLines) {
      if (!line) {
        // skip empty lines
      } else if (!headerParsed) {
        headerLine = line
        header = parseCsvHeader(line)
        headerParsed = true
      } else {
        const fields = splitCsvFields(line)
        const blockchain = fields[header!.blockchainIdx]?.trim() || ''
        const chainLower = blockchain.toLowerCase()

        if (ED25519_CHAIN_SET.has(chainLower)) {
          ed25519ChainNames.add(blockchain)
        }
        if (isLiquidChain(chainLower)) {
          hasLiquid = true
          currentBatchHasLiquid = true
        }

        currentLines.push(line)
        totalRowsParsed++

        if (currentLines.length >= BATCH_SIZE) {
          batchQueue.push({ lines: currentLines.join('\n'), rowCount: currentLines.length, hasLiquid: currentBatchHasLiquid })
          currentLines = []
          currentBatchHasLiquid = false
        }
      }
    }

    const parsePercent = Math.min(10, Math.round((offset / fileSize) * 10))
    onProgress({ phase: 'parse', percent: parsePercent })
  }

  // Handle leftover (last line without trailing newline)
  if (leftover.trim() && headerParsed) {
    const line = leftover.replace(/\r$/, '').trim()
    const fields = splitCsvFields(line)
    const blockchain = fields[header!.blockchainIdx]?.trim() || ''
    const chainLower = blockchain.toLowerCase()
    if (ED25519_CHAIN_SET.has(chainLower)) ed25519ChainNames.add(blockchain)
    if (isLiquidChain(chainLower)) { hasLiquid = true; currentBatchHasLiquid = true }
    currentLines.push(line)
    totalRowsParsed++
  }
  if (currentLines.length > 0) {
    batchQueue.push({ lines: currentLines.join('\n'), rowCount: currentLines.length, hasLiquid: currentBatchHasLiquid })
    currentLines = []
  }

  if (!headerParsed) throw new MissRequiredFieldError('HD Path')
  if (totalRowsParsed === 0) throw new MissDataError()

  const totalBatches = batchQueue.length
  const totalRows = totalRowsParsed

  console.log(`[STREAM] parse done: ${totalRows.toLocaleString()} rows, ${totalBatches} batches, ${(performance.now() - tParse).toFixed(0)}ms`)

  onProgress({ phase: 'parse', percent: 10 })

  // === Phase 2: Init workers (only worker 0 gets WASM if needed) ===
  const tInit = performance.now()
  const workerSlots: Worker[] = await createWorkers(workerCount, mnemonics, chainCode, hasLiquid)
  const workerBatchCount: number[] = new Array(workerCount).fill(0)
  console.log(`[STREAM] workers ready: ${workerCount} workers${hasLiquid ? ' (slot 0 has WASM)' : ''}, ${(performance.now() - tInit).toFixed(0)}ms`)

  // === Phase 3: Derive + write (sequential order) ===
  const tDerive = performance.now()
  const derivedBatches: Map<number, DerivedCSVRow[]> = new Map()
  let nextWriteIdx = 0
  let completedRows = 0
  let outputColumns: string[] | null = null
  let headerWritten = false
  let lastLogTime = tDerive
  let dispatchIdx = 0

  await new Promise<void>((resolve, reject) => {
    let rejected = false

    const terminateAll = () => {
      workerSlots.forEach(w => w.terminate())
    }

    const flushWriteBuffer = async () => {
      while (derivedBatches.has(nextWriteIdx) && nextWriteIdx < totalBatches) {
        const rows = derivedBatches.get(nextWriteIdx)!
        derivedBatches.delete(nextWriteIdx)

        if (!headerWritten) {
          outputColumns = Object.keys(rows[0])
          const headerRow = `${outputColumns.join(',')}\n`
          // eslint-disable-next-line no-await-in-loop
          await writeFileChunk(outputPath, `${headerRow}${batchToCsvChunk(rows, outputColumns)}`, false)
          headerWritten = true
        } else {
          // eslint-disable-next-line no-await-in-loop
          await writeFileChunk(outputPath, batchToCsvChunk(rows, outputColumns!), true)
        }
        nextWriteIdx++
      }

      if (nextWriteIdx >= totalBatches) {
        terminateAll()
        resolve()
      }
    }

    // Track which worker slots have WASM loaded
    const slotHasWasm: boolean[] = new Array(workerCount).fill(false)
    if (hasLiquid) slotHasWasm[0] = true

    const recycleWorker = async (slotIdx: number) => {
      workerSlots[slotIdx].terminate()
      workerBatchCount[slotIdx] = 0
      const loadWasm = slotHasWasm[slotIdx]
      try {
        const fresh = await createSingleWorker(mnemonics, chainCode, loadWasm)
        workerSlots[slotIdx] = fresh
        attachHandler(fresh, slotIdx)
        dispatchNext(fresh, slotIdx)
      } catch (err: any) {
        if (!rejected) { rejected = true; terminateAll(); reject(err) }
      }
    }

    const upgradeAndDispatch = async (slotIdx: number, batchIndex: number) => {
      workerSlots[slotIdx].terminate()
      workerBatchCount[slotIdx] = 0
      slotHasWasm[slotIdx] = true
      try {
        const fresh = await createSingleWorker(mnemonics, chainCode, true)
        workerSlots[slotIdx] = fresh
        attachHandler(fresh, slotIdx)
        const batch = batchQueue[batchIndex]
        fresh.postMessage({
          type: 'derive',
          batchIndex,
          headerLine,
          rawLines: batch.lines,
          rowCount: batch.rowCount,
        })
      } catch (err: any) {
        if (!rejected) { rejected = true; terminateAll(); reject(err) }
      }
    }

    const dispatchNext = (worker: Worker, slotIdx: number) => {
      if (dispatchIdx >= totalBatches) {
        flushWriteBuffer().catch(err => {
          if (!rejected) { rejected = true; terminateAll(); reject(err) }
        })
        return
      }

      const batch = batchQueue[dispatchIdx]
      const batchIndex = dispatchIdx
      dispatchIdx++

      // If batch has liquid rows and this worker has no WASM, upgrade it first
      if (batch.hasLiquid && !slotHasWasm[slotIdx]) {
        upgradeAndDispatch(slotIdx, batchIndex)
        return
      }

      worker.postMessage({
        type: 'derive',
        batchIndex,
        headerLine,
        rawLines: batch.lines,
        rowCount: batch.rowCount,
      })
    }

    const attachHandler = (worker: Worker, slotIdx: number) => {
      worker.onmessage = e => {
        if (rejected) return
        const msg = e.data

        if (msg.type === 'derive-done') {
          derivedBatches.set(msg.batchIndex, msg.rows)
          completedRows += msg.rows.length
          workerBatchCount[slotIdx]++

          const pct = 10 + Math.round((completedRows / totalRows) * 89)
          onProgress({ phase: 'derive', percent: Math.min(pct, 99) })

          const now = performance.now()
          if (now - lastLogTime > 5000) {
            const elapsed = ((now - tDerive) / 1000).toFixed(1)
            console.log(`[STREAM] progress: ${completedRows.toLocaleString()} / ${totalRows.toLocaleString()} rows, ${elapsed}s elapsed`)
            lastLogTime = now
          }

          if (workerBatchCount[slotIdx] >= WORKER_RECYCLE_INTERVAL) {
            flushWriteBuffer().catch(err => {
              if (!rejected) { rejected = true; terminateAll(); reject(err) }
            })
            recycleWorker(slotIdx)
            return
          }

          dispatchNext(worker, slotIdx)

          flushWriteBuffer().catch(err => {
            if (!rejected) { rejected = true; terminateAll(); reject(err) }
          })
          return
        }

        if (msg.type === 'derive-error') {
          rejected = true
          terminateAll()
          if (msg.errorName === 'ValidateAddressError') {
            reject(new ValidateAddressError(msg.error))
          } else {
            reject(new Error(msg.error))
          }
        }
      }

      worker.onerror = err => {
        if (rejected) return
        rejected = true
        terminateAll()
        reject(new Error(`Worker error: ${err.message}`))
      }
    }

    workerSlots.forEach((w, i) => attachHandler(w, i))
    workerSlots.forEach((w, i) => dispatchNext(w, i))
  })

  const tEnd = performance.now()
  console.log(`[STREAM] derive+write done: ${(tEnd - tDerive).toFixed(0)}ms`)
  console.log(`[STREAM] total: ${(tEnd - tStart).toFixed(0)}ms (${totalRows.toLocaleString()} rows)`)

  onProgress({ phase: 'write', percent: 100 })

  return { ed25519Chains: [...ed25519ChainNames] }
}
