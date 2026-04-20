/* eslint-disable max-classes-per-file */
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

  // Web Worker: no window but has self
  if (typeof self !== 'undefined' && typeof (self as any).importScripts === 'function') {
    return 'browser'
  }

  if (
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.node
  ) {
    return 'node'
  }
  return 'node'
}

/** Thrown when the Liquid WASM call returns a non-success status. */
export class LiquidSDKError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LiquidSDKError'
  }
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
      wasmBinary = liquidWasmBuffer.process('/src/lib/liquid/liquid.wasm')
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

  addressFromPublicKey(params: {
    public_key: string
    network: string
    address_type: string
  }): string {
    const res = this.invokeWasmMethod<{ non_confidential_address: string; error?: string }>(
      '_liquids_create_non_confidential_em',
      params
    )
    if (!res.success) {
      throw new LiquidSDKError(
        `${params.network}/${params.address_type}: ${(res as any)?.data?.error ?? 'WASM call failed'}`
      )
    }
    return res.data.non_confidential_address
  }
}
