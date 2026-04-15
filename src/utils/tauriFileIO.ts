import { invoke } from '@tauri-apps/api'

import { splitCsvLines } from './csvLineParser'

export const CHUNK_READ_SIZE = 4 * 1024 * 1024 // 4MB

export async function getFileSize(path: string): Promise<number> {
  return invoke<number>('get_file_size', { path })
}

export async function readFileChunk(
  path: string,
  offset: number,
  size: number
): Promise<{ text: string; bytesRead: number }> {
  const [text, bytesRead] = await invoke<[string, number]>('read_file_chunk', { path, offset, size })
  return { text, bytesRead }
}

export async function getTempPath(): Promise<string> {
  return invoke<string>('get_temp_path')
}

export async function copyFile(src: string, dst: string): Promise<void> {
  return invoke<void>('copy_file', { src, dst })
}

export async function writeFileChunk(
  path: string,
  content: string,
  append: boolean
): Promise<void> {
  return invoke<void>('write_file_chunk', { path, content, append })
}

export async function removeTempFile(path: string): Promise<void> {
  return invoke<void>('remove_temp_file', { path })
}

export async function registerSelectedPath(path: string): Promise<void> {
  return invoke<void>('register_selected_path', { path })
}

// --- Shared streaming helpers ---

/**
 * Stream a text file line-by-line, calling `onLine` for each non-empty line.
 * Optionally calls `onChunkEnd(offset, fileSize)` after each chunk for progress / abort checks.
 * Returns the total number of lines emitted.
 */
export async function streamFileLines(
  filePath: string,
  fileSize: number,
  onLine: (line: string) => Promise<void> | void,
  onChunkEnd?: (offset: number, fileSize: number) => void,
): Promise<number> {
  let offset = 0
  let leftover = ''
  let count = 0
  while (offset < fileSize) {
    const n = Math.min(CHUNK_READ_SIZE, fileSize - offset)
    // eslint-disable-next-line no-await-in-loop
    const { text, bytesRead } = await readFileChunk(filePath, offset, n)
    if (bytesRead === 0) break
    offset += bytesRead
    const combined = leftover + text
    const [lines, remainder] = splitCsvLines(combined)
    leftover = remainder
    for (const line of lines) {
      if (line) {
        // eslint-disable-next-line no-await-in-loop
        await onLine(line)
        count++
      }
    }
    onChunkEnd?.(offset, fileSize)
  }
  if (leftover.trim()) {
    await onLine(leftover.trim())
    count++
  }
  return count
}

/**
 * Read an entire file into a string (chunked to avoid exceeding IPC limits).
 */
export async function readFileText(filePath: string, fileSize: number): Promise<string> {
  let text = ''
  let offset = 0
  while (offset < fileSize) {
    const n = Math.min(CHUNK_READ_SIZE, fileSize - offset)
    // eslint-disable-next-line no-await-in-loop
    const { text: chunk, bytesRead } = await readFileChunk(filePath, offset, n)
    if (bytesRead === 0) break
    offset += bytesRead
    text += chunk
  }
  return text
}
