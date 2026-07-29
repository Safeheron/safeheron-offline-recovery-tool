/**
 * Regression test for WASM heap growth during SDK calls.
 *
 * `invokeWasmMethod` creates `Uint8Array` views on `HEAPU8.buffer` BEFORE
 * calling into WASM. Emscripten's heap can grow during the call
 * (memory.grow replaces the backing ArrayBuffer and detaches old views).
 * Reading output length/pointer from a detached view silently returns 0,
 * producing empty addresses for random rows in production.
 *
 * To reproduce reliably, we monkey-patch the WASM entrypoint so it triggers
 * a large malloc (forcing heap grow) AFTER writing the output. This leaves
 * the caller's pre-call views detached — exactly the production bug.
 *
 * @jest-environment node
 */
import { expect, test } from '@jest/globals'

import { LiquidSDK } from '@/wasm/liquidSDK'

const PUBKEY = '037ce417a22e7164a7698a6fc4532c78d4c17372416756ee812c6195b40d013b8a'
const PARAMS = { public_key: PUBKEY, network: 'liquid_mainnet', address_type: 'P2WPKH' }

test('addressFromPublicKey handles mid-call HEAPU8 detach', async () => {
  await LiquidSDK.init()
  const sdk = LiquidSDK.instance as any
  const wasm = sdk.instance as any
  const methodName = '_liquids_create_non_confidential_em'

  // Baseline (no patching) — establishes known-good output.
  const expected = sdk.addressFromPublicKey(PARAMS)
  expect(expected).toBe('ex1qdh5tmpsx9l3c3s288cd6sxdhzwfyj6sy2gz43u')

  // Monkey-patch: run the real WASM fn, then force heap grow so any views
  // created before the call are detached by the time the caller reads them.
  const original = wasm[methodName]
  const bigAllocs: number[] = []
  wasm[methodName] = function patched(...args: number[]) {
    const bufBefore = wasm.HEAPU8.buffer
    const ret = original.apply(this, args)
    // Keep doubling the requested size until grow actually happens.
    let size = 16 * 1024 * 1024
    while (wasm.HEAPU8.buffer === bufBefore && size < 512 * 1024 * 1024) {
      const p = wasm._malloc(size)
      if (p) bigAllocs.push(p)
      size *= 2
    }
    if (wasm.HEAPU8.buffer === bufBefore) {
      throw new Error('Test setup failed: could not force heap grow')
    }
    return ret
  }

  try {
    const addr = sdk.addressFromPublicKey(PARAMS)
    expect(addr).toBe(expected)
  } finally {
    wasm[methodName] = original
    for (const p of bigAllocs) wasm._free(p)
  }
})
