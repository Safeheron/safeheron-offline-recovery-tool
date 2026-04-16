import {
  CSV_FIELD_HD_PATH,
  LIQUID_CHAIN,
  LIQUID_TEST_CHAIN,
} from './const'
import { MissRequiredFieldError, MissDataError, UnsupportBlockChainError } from './csv'
import { RecoverHDKeyError, NetworkDetectedError } from './errors'
import { ValidateAddressError } from './mpc'
import {
  getFileSize,
  writeFileChunk,
  streamFileLines,
} from './tauriFileIO'
import { parseCsvHeader, splitCsvFields } from './csvLineParser'
import type { CsvHeaderInfo } from './csvLineParser'

// --- Streaming pipeline orchestrator ---

export { RecoverHDKeyError, NetworkDetectedError }

const BATCH_SIZE = 2000

export interface StreamProgress {
  phase: 'parse' | 'derive' | 'write'
  percent: number // 0-100
}

export interface StreamResult {
  ed25519Chains: string[]
  totalRows: number
}

const ED25519_ALGO = 'ed25519'

function isLiquidChain(chainLower: string): boolean {
  return chainLower === LIQUID_CHAIN || chainLower === LIQUID_TEST_CHAIN
}

// Recycle a worker after this many batches to cap per-worker V8 heap at
// ~750MB. Empirically, 1000 batches (2M rows) is where a worker's isolate
// reaches that level. For an 18.5M-row file this means ~5 recycles total
// across all workers — overhead < 3s on a 30-min run.
const WORKER_RECYCLE_INTERVAL = 1000

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
        reject(new RecoverHDKeyError(e.data.error))
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
 * Create N workers with no WASM pre-load. Slots get upgraded on demand when a
 * Liquid-containing batch first hits them (see dispatchToSlot).
 */
async function createWorkers(
  count: number,
  mnemonics: string[],
  chainCode: string,
): Promise<Worker[]> {
  const promises = Array.from({ length: count }, () =>
    createSingleWorker(mnemonics, chainCode, false)
  )
  return Promise.all(promises)
}

export interface StreamCsvOptions {
  /** Source is JSON backup — Address field may be empty */
  skipAddressCheck?: boolean
  signal?: AbortSignal
  /** Override worker count. Defaults to (CPU cores - 2), min 2. Use 1 for small files. */
  workerCount?: number
  /**
   * Input file has a `<sourceIdx>\t` prefix on every data row (header unchanged).
   * Set for JSON paths where expandSortedJsonToTempCsv produced the input; unset
   * for user CSV (sourceIdx is then assigned as the row's parse-order line index).
   */
  inputHasSourceIdxPrefix?: boolean
}

type Batch = {
  lines: string[]
  sourceIdxs: number[]
  rowCount: number
  hasLiquid: boolean
}

/**
 * Streaming recovery pipeline: parse + derive + write, all concurrent.
 *
 * Unlike the older "parse all → then derive" design, this keeps no persistent
 * in-memory batchQueue. As parse produces a full batch it waits for an idle
 * worker and dispatches immediately, then the batch can be GC'd. Peak main-
 * thread memory is O(worker_count) regardless of input size.
 *
 * Output `derivedPath` carries `<sourceIdx>\t<csvFields>` per row; downstream
 * restoreSourceOrder reorders by the inline sourceIdx.
 */
export async function streamCsvProcess(
  filePath: string,
  outputPath: string,
  mnemonics: string[],
  chainCode: string,
  onProgress: (progress: StreamProgress) => void,
  options?: StreamCsvOptions
): Promise<StreamResult> {
  const tStart = performance.now()
  const fileSize = await getFileSize(filePath)
  const defaultWorkerCount = Math.min(
    4,
    Math.max((navigator.hardwareConcurrency || 4) - 2, 2),
  )
  const workerCount = options?.workerCount ?? defaultWorkerCount
  const hasSourceIdxPrefix = !!options?.inputHasSourceIdxPrefix

  // === Init workers first (no WASM pre-load; upgradeOnDemand in dispatchToSlot) ===
  const tInit = performance.now()
  const workerSlots: Worker[] = await createWorkers(workerCount, mnemonics, chainCode)
  const slotHasWasm: boolean[] = new Array(workerCount).fill(false)
  console.log(`[STREAM] workers ready: ${workerCount}, ${(performance.now() - tInit).toFixed(0)}ms`)

  // === Shared state ===
  let totalRowsParsed = 0
  let completedRows = 0
  const workerBatchCount: number[] = new Array(workerCount).fill(0)
  let batchesDispatched = 0
  let batchesCompleted = 0
  let parseFinished = false
  let headerParsed = false
  let headerLine = ''
  let header: CsvHeaderInfo | null = null
  const ed25519ChainNames = new Set<string>()

  let outputColumns: string[] | null = null
  let headerWritten = false
  let writeChain: Promise<void> = Promise.resolve()
  let lastLogTime = performance.now()
  let maxReportedPercent = 0
  let parseOffset = 0 // bytes parsed so far; drives progress during parse+derive overlap

  const idleSlots: number[] = []
  const idleWaiters: Array<{ resolve: (slotIdx: number) => void; reject: (err: Error) => void }> = []

  let rejected = false
  let done = false
  // These get set below when the process-promise is constructed.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let outerResolve: () => void = () => { /* set when processPromise is built */ }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let outerReject: (err: Error) => void = () => { /* set when processPromise is built */ }

  // All workers start idle.
  for (let i = 0; i < workerCount; i++) idleSlots.push(i)

  // Progress helper: monotonically non-decreasing.
  const reportProgress = (phase: StreamProgress['phase'], percent: number) => {
    if (percent > maxReportedPercent) {
      maxReportedPercent = percent
      onProgress({ phase, percent })
    }
  }

  // Unified progress: during parse+derive, use file offset (it tracks derive
  // progress too because backpressure keeps parse paced by workers). After
  // parse ends, switch to completed/parsed ratio to show the tail catching up.
  const updateProgress = () => {
    let pct: number
    if (!parseFinished) {
      // 0-90% driven by how much input has been read and dispatched.
      pct = fileSize > 0 ? Math.round((parseOffset / fileSize) * 90) : 0
    } else if (totalRowsParsed > 0) {
      // 90-99% while the last dispatched batches finish deriving.
      pct = 90 + Math.round((completedRows / totalRowsParsed) * 9)
    } else {
      pct = 99
    }
    reportProgress('derive', Math.min(99, Math.max(0, pct)))
  }

  const waitForIdleSlot = (): Promise<number> => new Promise((resolve, reject) => {
    if (rejected || done) { reject(new Error('aborted')); return }
    const slot = idleSlots.shift()
    if (slot !== undefined) {
      resolve(slot)
      return
    }
    idleWaiters.push({ resolve, reject })
  })

  const markSlotIdle = (slotIdx: number) => {
    const waiter = idleWaiters.shift()
    if (waiter) waiter.resolve(slotIdx)
    else idleSlots.push(slotIdx)
  }

  const wakeIdleWaiters = (err: Error) => {
    const waiters = idleWaiters.splice(0)
    waiters.forEach(w => w.reject(err))
  }

  const terminateAll = () => {
    workerSlots.forEach(w => w.terminate())
    wakeIdleWaiters(new Error('aborted'))
  }

  // Serialize writes onto a promise chain so concurrent worker completions
  // don't overlap append IPC calls.
  const appendSerialized = (content: string, append: boolean): Promise<void> => {
    const next = writeChain.then(() => writeFileChunk(outputPath, content, append))
    writeChain = next.catch(() => { /* absorb; caller sees error via their await */ })
    return next
  }

  const dispatchToSlot = async (slotIdx: number, batch: Batch, batchIndex: number) => {
    // On-demand WASM upgrade: if this batch has Liquid rows and the slot lacks
    // WASM, terminate + recreate with WASM loaded before posting.
    if (batch.hasLiquid && !slotHasWasm[slotIdx]) {
      workerSlots[slotIdx].terminate()
      slotHasWasm[slotIdx] = true
      try {
        const fresh = await createSingleWorker(mnemonics, chainCode, true)
        if (rejected || done) { fresh.terminate(); return }
        workerSlots[slotIdx] = fresh
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        attachHandler(fresh, slotIdx)
      } catch (err: any) {
        if (!rejected) { rejected = true; terminateAll(); outerReject(err) }
        return
      }
    }

    if (rejected || done) return

    // sourceIdxs travel with the batch; worker uses them to prefix output rows.
    workerSlots[slotIdx].postMessage({
      type: 'derive',
      batchIndex,
      headerLine,
      rawLines: batch.lines,
      rowCount: batch.rowCount,
      sourceIdxs: batch.sourceIdxs,
      skipAddressCheck: !!options?.skipAddressCheck,
    })
  }

  const recycleWorker = async (slotIdx: number) => {
    workerSlots[slotIdx].terminate()
    workerBatchCount[slotIdx] = 0
    const loadWasm = slotHasWasm[slotIdx]
    try {
      const fresh = await createSingleWorker(mnemonics, chainCode, loadWasm)
      if (rejected || done) { fresh.terminate(); return }
      workerSlots[slotIdx] = fresh
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      attachHandler(fresh, slotIdx)
      markSlotIdle(slotIdx)
    } catch (err: any) {
      if (!rejected) { rejected = true; terminateAll(); outerReject(err) }
    }
  }

  const attachHandler = (worker: Worker, slotIdx: number) => {
    worker.onmessage = async e => {
      if (rejected || done) return
      const msg = e.data

      if (msg.type === 'derive-done') {
        // Worker already built the CSV chunk (with `<sourceIdx>\t` prefix) and
        // returned `columns` for the header. Main thread just needs to write.
        const { chunkContent, rowCount, columns } = msg as {
          chunkContent: string
          rowCount: number
          columns: string[]
        }

        completedRows += rowCount
        batchesCompleted++
        workerBatchCount[slotIdx]++

        if (!outputColumns) outputColumns = columns

        // Await the write (backpressure on this worker's next batch).
        try {
          if (!headerWritten) {
            headerWritten = true
            const headerRow = `${outputColumns.join(',')}\n`
            await appendSerialized(`${headerRow}${chunkContent}`, false)
          } else {
            await appendSerialized(chunkContent, true)
          }
        } catch (err: any) {
          if (!rejected) { rejected = true; terminateAll(); outerReject(err) }
          return
        }
        if (rejected || done) return

        updateProgress()

        const now = performance.now()
        if (now - lastLogTime > 5000) {
          const elapsed = ((now - tStart) / 1000).toFixed(1)
          console.log(`[STREAM] progress: ${completedRows.toLocaleString()} rows (of ${totalRowsParsed.toLocaleString()} parsed), ${elapsed}s elapsed`)
          lastLogTime = now
        }

        // Recycle worker to cap per-isolate V8 heap at ~750MB.
        if (workerBatchCount[slotIdx] >= WORKER_RECYCLE_INTERVAL) {
          recycleWorker(slotIdx)
          return
        }

        // Termination: all parsed AND all dispatched AND all completed.
        if (parseFinished && batchesCompleted >= batchesDispatched) {
          done = true
          terminateAll()
          outerResolve()
          return
        }

        markSlotIdle(slotIdx)
        return
      }

      if (msg.type === 'derive-error') {
        rejected = true
        terminateAll()
        if (msg.errorName === 'ValidateAddressError') outerReject(new ValidateAddressError(msg.error))
        else if (msg.errorName === 'MissRequiredFieldError') outerReject(new MissRequiredFieldError(msg.error))
        else if (msg.errorName === 'UnsupportBlockChainError') outerReject(new UnsupportBlockChainError(msg.error))
        else outerReject(new Error(msg.error))
      }
    }

    worker.onerror = err => {
      if (rejected) return
      rejected = true
      terminateAll()
      outerReject(new Error(`Worker error: ${err.message}`))
    }
  }
  workerSlots.forEach((w, i) => attachHandler(w, i))

  // Promise that resolves when all parsing+derive+write are done.
  const processPromise = new Promise<void>((resolve, reject) => {
    outerResolve = resolve
    outerReject = reject

    if (options?.signal) {
      const onAbort = () => {
        if (rejected) return
        rejected = true
        terminateAll()
        reject(new NetworkDetectedError())
      }
      if (options.signal.aborted) onAbort()
      else options.signal.addEventListener('abort', onAbort, { once: true })
    }
  })

  // === Streaming parse: dispatch batches as soon as they fill up ===
  let currentLines: string[] = []
  let currentSourceIdxs: number[] = []
  let currentBatchHasLiquid = false

  const dispatchReadyBatch = async () => {
    const batch: Batch = {
      lines: currentLines,
      sourceIdxs: currentSourceIdxs,
      rowCount: currentLines.length,
      hasLiquid: currentBatchHasLiquid,
    }
    currentLines = []
    currentSourceIdxs = []
    currentBatchHasLiquid = false

    const slotIdx = await waitForIdleSlot()
    if (rejected || done) return
    const batchIndex = batchesDispatched
    batchesDispatched++
    await dispatchToSlot(slotIdx, batch, batchIndex)
  }

  const processLine = async (line: string) => {
    if (rejected || done) return

    if (!headerParsed) {
      headerLine = line
      header = parseCsvHeader(line)
      headerParsed = true
      return
    }

    let sourceIdx: number
    let csvLine: string
    if (hasSourceIdxPrefix) {
      const tabIdx = line.indexOf('\t')
      sourceIdx = parseInt(line.slice(0, tabIdx), 10)
      csvLine = line.slice(tabIdx + 1)
    } else {
      sourceIdx = totalRowsParsed
      csvLine = line
    }

    const fields = splitCsvFields(csvLine)
    const blockchain = fields[header!.blockchainIdx]?.trim() || ''
    const chainLower = blockchain.toLowerCase()
    const algo = fields[header!.algoIdx]?.trim() || ''

    if (algo.toLowerCase() === ED25519_ALGO) ed25519ChainNames.add(blockchain)
    if (isLiquidChain(chainLower)) currentBatchHasLiquid = true

    currentLines.push(csvLine)
    currentSourceIdxs.push(sourceIdx)
    totalRowsParsed++

    if (currentLines.length >= BATCH_SIZE) {
      await dispatchReadyBatch()
    }
  }

  const onParseChunk = (offset: number) => {
    if (rejected) return
    parseOffset = offset
    updateProgress()
  }

  try {
    await streamFileLines(filePath, fileSize, processLine, onParseChunk)

    // Flush final partial batch.
    if (currentLines.length > 0 && !rejected) {
      await dispatchReadyBatch()
    }

    if (!headerParsed) {
      if (!rejected) { rejected = true; terminateAll(); outerReject(new MissRequiredFieldError(CSV_FIELD_HD_PATH)) }
    } else if (totalRowsParsed === 0) {
      if (!rejected) { rejected = true; terminateAll(); outerReject(new MissDataError()) }
    }
  } catch (err: any) {
    if (err.message === 'aborted') {
      // Parse unwound because of an abort triggered elsewhere; processPromise
      // already has a rejection from that site.
    } else if (!rejected) {
      rejected = true
      terminateAll()
      outerReject(err)
    }
  }

  parseFinished = true
  console.log(`[STREAM] parse done: ${totalRowsParsed.toLocaleString()} rows, ${batchesDispatched} batches`)
  updateProgress()

  // If every dispatched batch already completed (tiny input), resolve now.
  if (!rejected && !done && batchesCompleted >= batchesDispatched) {
    done = true
    terminateAll()
    outerResolve()
  }

  await processPromise

  const tEnd = performance.now()
  console.log(`[STREAM] total: ${(tEnd - tStart).toFixed(0)}ms (${totalRowsParsed.toLocaleString()} rows)`)
  reportProgress('write', 100)

  return { ed25519Chains: [...ed25519ChainNames], totalRows: totalRowsParsed }
}
