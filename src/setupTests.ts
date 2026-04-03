import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'util'

const globalThis = global as any

globalThis.window = {}

if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder
}

if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = TextDecoder
}
