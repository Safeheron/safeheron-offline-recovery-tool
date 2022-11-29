import type { WebviewWindow } from '@tauri-apps/api/window'

declare global {
  module '*.png'
  interface Window {
    mnemonicToKeyWindow: WebviewWindow
  }
}
