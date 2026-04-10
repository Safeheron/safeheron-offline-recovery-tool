import { invoke } from '@tauri-apps/api'

export const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024 // 50MB

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

export async function registerSelectedPath(path: string): Promise<void> {
  return invoke<void>('register_selected_path', { path })
}
