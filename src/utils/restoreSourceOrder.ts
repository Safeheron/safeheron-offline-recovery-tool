/**
 * Restore source row order for a derived CSV produced by streamCsvProcess.
 *
 * Input format (derivedPath):
 *   - Line 1: plain CSV header.
 *   - Data lines: `<sourceIdx>\t<csvFields>` — sourceIdx is the row's target
 *     position in the final output (set by the upstream stage).
 *
 * Algorithm (external bucket sort):
 *   Pass 1: streaming read derivedPath; for each data line, parse the inline
 *           sourceIdx and route to one of N buckets by sourceIdx range.
 *   Pass 2: for each bucket in order, load, sort by sourceIdx, strip the
 *           prefix, and append to finalPath.
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
 * Read `derivedPath` (inline-sourceIdx format) and write a re-ordered copy to
 * `finalPath` with the sourceIdx prefix stripped.
 *
 * Both paths must be absolute. Intermediate bucket files are cleaned up on
 * success AND on error.
 */
export async function restoreSourceOrder(
  derivedPath: string,
  finalPath: string,
  totalRows: number,
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

  const fileSize = await getFileSize(derivedPath)
  const maxSourceIdx = totalRows - 1
  const bucketCount = Math.max(1, Math.ceil((maxSourceIdx + 1) / TARGET_ROWS_PER_BUCKET))
  const bucketRange = Math.ceil((maxSourceIdx + 1) / bucketCount)
  // Each bucket gets its own temp file created atomically by get_temp_path.
  const bucketPaths: string[] = []
  for (let i = 0; i < bucketCount; i++) {
    // eslint-disable-next-line no-await-in-loop
    bucketPaths.push(await getTempPath())
  }
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
    // --- Pass 1: stream derivedPath; parse inline sourceIdx; route to buckets ---
    let headerLine = ''
    let headerParsed = false

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
        return
      }
      const tabPos = line.indexOf('\t')
      if (tabPos <= 0) return // skip malformed lines (shouldn't happen)
      const sourceIdx = parseInt(line.slice(0, tabPos), 10)
      if (!Number.isFinite(sourceIdx)) return
      const b = Math.min(bucketCount - 1, Math.floor(sourceIdx / bucketRange))
      // Bucket stores the full line (sourceIdx prefix intact); Pass 2 strips it.
      bucketBuffers[b].push(line)
      if (bucketBuffers[b].length >= BUCKET_FLUSH_THRESHOLD) {
        await flushBucket(b)
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

        // Each bucket line is "<sourceIdx>\t<csvFields>"; parse, sort, strip prefix.
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
