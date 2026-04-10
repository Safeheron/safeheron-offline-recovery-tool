import { colorTokens } from './tokens'

export function injectColorTokens() {
  const root = document.documentElement
  for (const [key, value] of Object.entries(colorTokens)) {
    const varName = `--color-${key.replace(/\//g, '-')}`
    root.style.setProperty(varName, value)
  }
}
