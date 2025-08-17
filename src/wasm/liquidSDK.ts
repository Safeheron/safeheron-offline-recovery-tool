import initWasm from '../lib/liquid/liquid'
// @ts-ignore
import liquidWasmBuffer from '../lib/liquid/liquid.wasm'

import BaseSDK from './baseSDK'

/**
 * Determine the current operating environment
 * @returns 'node' | 'browser'
 */
const getEnvironment = (): 'node' | 'browser' => {
  if (typeof window !== 'undefined' && window.document) {
    return 'browser'
  }

  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return 'node'
  }
  return 'node'
}

export class LiquidSDK extends BaseSDK {
  public readonly instance?: WebAssembly.Instance

  static instance: LiquidSDK

  static async init() {
    if (LiquidSDK.instance) {
      return LiquidSDK.instance
    }

    let wasmBinary: Uint8Array = liquidWasmBuffer

    if (getEnvironment() === 'node') {
      wasmBinary = liquidWasmBuffer.process('/src/lib/liquid/safeheronliquidsdk.wasm')
    }

    const instance = await initWasm({
      wasmBinary,
      wasmBinaryFile: 'liquid.wasm',
    })

    LiquidSDK.instance = new LiquidSDK(instance)

    return LiquidSDK.instance
  }

  constructor(instance: WebAssembly.Instance) {
    super(instance)
    this.instance = instance
  }

  addressFromPublicKey(params: {public_key: string; network: string, address_type: string}): string {
    try {
      const res = this.invokeWasmMethod<{non_confidential_address: string}>('_liquids_create_non_confidential_em', params)
      if (res.success) return res.data.non_confidential_address
    } catch (error) {
      console.error('[LIQUID SDK ERROR]: ', error)
    }
    return ''
  }
}
