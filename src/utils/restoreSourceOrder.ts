/**
 * Restore source row order for a derived CSV produced by the JSON-backup path.
 *
 * Background (see O-2603 perf analysis):
 *   JSON expansion produces rows in "chain x account" order — each row has a
 *   distinct parent HD path, so the worker parentKeyCache misses on every row.
 *
 *   The fix: sort rows by (algo, parentPath, lastIndex) before derive so
 *   adjacent rows share a parent and the cache hits ~88%. After derive, this
 *   module restores the original source order using a sidecar mapping file
 *   written alongside the sorted temp CSV.
 *
 * Algorithm (external bucket sort):
 *   Pass 1: streaming read the derived CSV + mapping file in lockstep,
 *           route each row to one of N buckets by sourceIdx range.
 *   Pass 2: for each bucket in order, load into memory, sort by sourceIdx,
 *           append to final CSV.
 *
 *   Bucket size is tuned so each bucket fits comfortably in RAM (~25K rows /
 *   ~6MB), regardless of total row count.
 */
import {
  getFileSize,
  writeFileChunk,
  getTempPath,
  removeTempFile,
  streamFileLines,
  readFileText,
} from './tauriFileIO'
import { splitCsvLines } from './csvLineParser'
import { NetworkDetectedError } from './errors'

const TARGET_ROWS_PER_BUCKET = 25_000
// Lines are queued in memory per-bucket and flushed once a threshold is hit;
// smaller means more fs calls, larger means more RAM. 500 lines x ~300B = ~150KB per bucket.
const BUCKET_FLUSH_THRESHOLD = 500

export interface RestoreProgress {
  /** 0..1 — pass 1 bucketing = first half, pass 2 sorted writeout = second half */
  fraction: number
}

/**
 * Read the sidecar mapping file (one sourceIdx per line) into a number array.
 */
async function readMappingFile(mappingPath: string): Promise<number[]> {
  const size = await getFileSize(mappingPath)
  const mapping: number[] = []
  await streamFileLines(mappingPath, size, line => {
    const idx = parseInt(line, 10)
    if (Number.isFinite(idx)) mapping.push(idx)
  })
  return mapping
}

/**
 * Read `derivedPath` (a normal CSV without __sourceIdx) and write a re-ordered
 * copy to `finalPath` using the sourceIdx permutation from `mappingPath`.
 *
 * Both paths must be absolute. Intermediate bucket files are cleaned up on
 * success AND on error.
 */
export async function restoreSourceOrder(
  derivedPath: string,
  finalPath: string,
  totalRows: number,
  mappingPath: string,
  onProgress?: (p: RestoreProgress) => void,
  signal?: AbortSignal,
): Promise<{ totalRows: number; bucketCount: number; ms: number }> {
  const t0 = performance.now()

  if (totalRows <= 0) {
    await writeFileChunk(finalPath, '', false)
    return { totalRows: 0, bucketCount: 0, ms: performance.now() - t0 }
  }

  const checkAborted = () => {
    if (signal?.aborted) throw new NetworkDetectedError()
  }

  checkAborted()

  // Read the mapping (sourceIdx per sorted-line) into memory (~17MB for 2.37M rows).
  const mapping = await readMappingFile(mappingPath)

  const fileSize = await getFileSize(derivedPath)
  const maxSourceIdx = totalRows - 1
  const bucketCount = Math.max(1, Math.ceil((maxSourceIdx + 1) / TARGET_ROWS_PER_BUCKET))
  const bucketRange = Math.ceil((maxSourceIdx + 1) / bucketCount)
  const tempBase = await getTempPath()
  // The Rust side of `remove_temp_file` (and the app's startup cleanup sweep) only
  // recognizes files whose names match `safeheron-offline-recovery-*.csv`. Strip the
  // trailing `.csv` first so each bucket becomes `...-<hex>.bkt${i}.csv`.
  const tempPrefix = tempBase.endsWith('.csv') ? tempBase.slice(0, -4) : tempBase
  const bucketPaths = Array.from({ length: bucketCount }, (_, i) => `${tempPrefix}.bkt${i}.csv`)
  const bucketBuffers: string[][] = Array.from({ length: bucketCount }, () => [])
  // write_file_chunk's append mode on the Rust side requires the file to exist;
  // we track first-flush per bucket so the initial write uses append=false (create).
  const bucketCreated: boolean[] = new Array(bucketCount).fill(false)

  const cleanup = async () => {
    for (const p of bucketPaths) {
      // eslint-disable-next-line no-await-in-loop
      await removeTempFile(p).catch(() => { /* best-effort */ })
    }
  }

  try {
    // --- Pass 1: streaming read derived CSV, pair with mapping, route to buckets ---
    let headerLine = ''
    let headerParsed = false
    let lineIdx = 0

    const flushBucket = async (b: number) => {
      const lines = bucketBuffers[b]
      if (lines.length === 0) return
      await writeFileChunk(bucketPaths[b], `${lines.join('\n')}\n`, bucketCreated[b])
      bucketCreated[b] = true
      bucketBuffers[b] = []
    }

    await streamFileLines(derivedPath, fileSize, async line => {
      if (!headerParsed) {
        headerLine = line
        headerParsed = true
      } else {
        const sourceIdx = lineIdx < mapping.length ? mapping[lineIdx] : lineIdx
        lineIdx++
        const b = Math.min(bucketCount - 1, Math.floor(sourceIdx / bucketRange))
        bucketBuffers[b].push(`${sourceIdx}\t${line}`)
        if (bucketBuffers[b].length >= BUCKET_FLUSH_THRESHOLD) {
          await flushBucket(b)
        }
      }
    }, offset => {
      checkAborted()
      onProgress?.({ fraction: Math.min(0.5, (offset / fileSize) * 0.5) })
    })
    for (let b = 0; b < bucketCount; b++) {
      // eslint-disable-next-line no-await-in-loop
      await flushBucket(b)
    }

    console.log(
      `[RESTORE] pass1 done: ${totalRows.toLocaleString()} rows -> ${bucketCount} buckets ` +
      `(range ${bucketRange.toLocaleString()}) in ${(performance.now() - t0).toFixed(0)}ms`
    )

    // --- Pass 2: for each bucket in order, load, sort by sourceIdx, write to final ---
    await writeFileChunk(finalPath, `${headerLine}\n`, false)

    for (let b = 0; b < bucketCount; b++) {
      // eslint-disable-next-line no-await-in-loop
      const bSize = await getFileSize(bucketPaths[b]).catch(() => 0)
      if (bSize === 0) {
        onProgress?.({ fraction: 0.5 + ((b + 1) / bucketCount) * 0.5 })
      } else {
        checkAborted()
        // eslint-disable-next-line no-await-in-loop
        const bText = await readFileText(bucketPaths[b], bSize)

        const [bLines, bRemainder] = splitCsvLines(bText)
        const allLines = bRemainder.trim() ? [...bLines, bRemainder.trim()] : bLines

        // Each bucket line is prefixed with "sourceIdx\toriginalCsvLine"
        const pairs: Array<{ idx: number; line: string }> = []
        for (const bucketLine of allLines) {
          if (bucketLine) {
            const tabPos = bucketLine.indexOf('\t')
            if (tabPos > 0) {
              const idx = parseInt(bucketLine.slice(0, tabPos), 10)
              pairs.push({ idx, line: bucketLine.slice(tabPos + 1) })
            }
          }
        }
        pairs.sort((a, b_) => a.idx - b_.idx)

        // eslint-disable-next-line no-await-in-loop
        await writeFileChunk(finalPath, `${pairs.map(p => p.line).join('\n')}\n`, true)
        // eslint-disable-next-line no-await-in-loop
        await removeTempFile(bucketPaths[b]).catch(() => { /* best-effort */ })
        onProgress?.({ fraction: 0.5 + ((b + 1) / bucketCount) * 0.5 })
      }
    }

    const totalMs = performance.now() - t0
    console.log(`[RESTORE] total: ${totalRows.toLocaleString()} rows in ${totalMs.toFixed(0)}ms`)
    onProgress?.({ fraction: 1 })
    return { totalRows, bucketCount, ms: totalMs }
  } catch (err) {
    await cleanup()
    throw err
  }
}
