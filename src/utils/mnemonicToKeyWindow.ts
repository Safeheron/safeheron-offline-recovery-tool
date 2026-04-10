import { WebviewWindow } from '@tauri-apps/api/window'

let mnemonicToKeyWindow: WebviewWindow | null = null

export const openMnemonicToKeyWindow = (version: string) => {
  const existingWindow = WebviewWindow.getByLabel('mnemonicToKey')
  if (existingWindow) {
    mnemonicToKeyWindow = existingWindow
    existingWindow.setFocus()
    return existingWindow
  }

  const nextWindow = new WebviewWindow('mnemonicToKey', {
    url: `#/mnemonicToKey?version=${version}`,
    title: '',
    width: 500,
    height: version === 'v1' ? 620 : 520,
    resizable: false,
  })

  mnemonicToKeyWindow = nextWindow

  nextWindow.once('tauri://destroyed', () => {
    if (mnemonicToKeyWindow === nextWindow) {
      mnemonicToKeyWindow = null
    }
  })

  return nextWindow
}

export const emitMnemonicToKeyWindow = async <T>(event: string, payload: T) => {
  const targetWindow = mnemonicToKeyWindow || WebviewWindow.getByLabel('mnemonicToKey')
  if (!targetWindow) {
    return
  }

  mnemonicToKeyWindow = targetWindow
  await targetWindow.emit(event, payload)
}
