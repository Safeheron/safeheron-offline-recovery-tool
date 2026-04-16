import {
  recoverHDKeyFromMnemonics,
  MultiAlgoHDKey,
  recoverDerivedCSV,
  createDeriveCache,
  DeriveCache,
  RawCSVRow,
  ValidateAddressError,
} from '@/utils/mpc'
import { sanitizeCsvValue, MissRequiredFieldError, UnsupportBlockChainError } from '@/utils/csv'
import { parseCsvHeader, parseCsvLine, escapeCsvField } from '@/utils/csvLineParser'
import { LiquidSDK } from '@/wasm/liquidSDK'

interface InitMessage {
  type: 'init'
  mnemonics: string[]
  chainCode: string
  hasLiquid: boolean
}

interface DeriveMessage {
  type: 'derive'
  batchIndex: number
  headerLine: string
  rawLines: string[]
  rowCount: number
  /**
   * Per-row sourceIdx (parallel to rawLines). The worker emits each output row
   * prefixed with `<sourceIdx>\t` so downstream restoreSourceOrder can
   * reorder without a separate mapping file.
   */
  sourceIdxs: number[]
  skipAddressCheck: boolean
}

type WorkerMessage = InitMessage | DeriveMessage

let hdKey: MultiAlgoHDKey | null = null
// Global cache: persists across batches, reset when worker is recycled
let deriveCache: DeriveCache = createDeriveCache()

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data

  if (msg.type === 'init') {
    (async () => {
      try {
        if (msg.hasLiquid) {
          await LiquidSDK.init()
        }
        hdKey = recoverHDKeyFromMnemonics(
          msg.mnemonics,
          msg.chainCode || undefined
        )
        deriveCache = createDeriveCache()
        self.postMessage({ type: 'init-done' })
      } catch (err: any) {
        self.postMessage({ type: 'init-error', error: err.message })
      }
    })()
    return
  }

  if (msg.type === 'derive') {
    if (!hdKey) {
      self.postMessage({
        type: 'derive-error',
        batchIndex: msg.batchIndex,
        error: 'HDKey not initialized',
      })
      return
    }
    try {
      const header = parseCsvHeader(msg.headerLine)
      const parseOptions = { skipAddressCheck: msg.skipAddressCheck }
      const rows: RawCSVRow[] = msg.rawLines
        .map(line => parseCsvLine(line, header, parseOptions))

      const derived = recoverDerivedCSV(rows, hdKey, deriveCache)

      // Serialize directly to a CSV chunk string with "<sourceIdx>\t" prefix
      // per row. Building the string here keeps large object arrays off the
      // wire and off the main thread's heap.
      const columns = Object.keys(derived[0])
      const lines: string[] = new Array(derived.length)
      for (let i = 0; i < derived.length; i++) {
        const row = derived[i] as unknown as Record<string, string>
        const fields = columns
          .map(col => escapeCsvField(String(sanitizeCsvValue(row[col] ?? ''))))
          .join(',')
        lines[i] = `${msg.sourceIdxs[i]}\t${fields}`
      }
      const chunkContent = `${lines.join('\n')}\n`

      self.postMessage({
        type: 'derive-done',
        batchIndex: msg.batchIndex,
        chunkContent,
        rowCount: derived.length,
        columns,
      })
    } catch (err: any) {
      let errorName = 'Error'
      if (err instanceof ValidateAddressError) errorName = 'ValidateAddressError'
      else if (err instanceof MissRequiredFieldError) errorName = 'MissRequiredFieldError'
      else if (err instanceof UnsupportBlockChainError) errorName = 'UnsupportBlockChainError'
      self.postMessage({
        type: 'derive-error',
        batchIndex: msg.batchIndex,
        error: err.message,
        errorName,
      })
    }
  }
}
