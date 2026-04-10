import {
  recoverHDKeyFromMnemonics,
  MultiAlgoHDKey,
  recoverDerivedCSV,
  createDeriveCache,
  DeriveCache,
  RawCSVRow,
  DerivedCSVRow,
} from '@/utils/mpc'
import { sanitizeCsvValue } from '@/utils/csv'
import { parseCsvHeader, parseCsvLine } from '@/utils/csvLineParser'
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
  rawLines: string
  rowCount: number
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
      const rows: RawCSVRow[] = msg.rawLines
        .split('\n')
        .map(line => parseCsvLine(line, header))

      const derived = recoverDerivedCSV(rows, hdKey, deriveCache)
      const sanitized = derived.map(row =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, sanitizeCsvValue(v)])
        )
      ) as unknown as DerivedCSVRow[]
      self.postMessage({
        type: 'derive-done',
        batchIndex: msg.batchIndex,
        rows: sanitized,
      })
    } catch (err: any) {
      self.postMessage({
        type: 'derive-error',
        batchIndex: msg.batchIndex,
        error: err.message,
        errorName: err.constructor?.name || 'Error',
      })
    }
  }
}
