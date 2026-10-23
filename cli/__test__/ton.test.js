/**
 * @jest-environment node
 */
import { expect, test, describe, beforeEach, jest } from '@jest/globals'

import { transfer, ftTransfer } from '../ton'

test('transfer ton', async () => {
  await expect(transfer({
    receiver: '0QCUpPftkR2TXlg8dFvOT7JX9lquQCfGAmoF5Ra1jv_GOlxq',
    amount: '0.000001',
    privateKey: 'aac52ab8254151d0913ea5fe18c0f0a4b5196e9fad6a3c55d3feea268cd7cb06',
    network: 'testnet',
  })).resolves.not.toThrow()
}, 40 * 1000)

test('transfer USDT token', async () => {
  await expect(ftTransfer({
    receiver: '0QCUpPftkR2TXlg8dFvOT7JX9lquQCfGAmoF5Ra1jv_GOlxq',
    amount: '0.000001',
    privateKey: 'aac52ab8254151d0913ea5fe18c0f0a4b5196e9fad6a3c55d3feea268cd7cb06',
    network: 'testnet',
    ftoken: 'kQD0GKBM8ZbryVk2aESmzfU6b9b_8era_IkvBSELujFZPsyy',
  })).resolves.not.toThrow()
}, 40 * 1000)

// Offline cases: the TON client and node-fetch are stubbed, no RPC is touched.
jest.mock('node-fetch')

describe('getJettonDecimals offline', () => {
  const fetch = require('node-fetch')
  const crypto = require('crypto')
  const { beginCell, Dictionary } = require('@ton/ton')
  const { getJettonDecimals } = require('../ton')

  const MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
  const URI = 'https://meta.example/jetton.json'
  const key = name => BigInt(`0x${crypto.createHash('sha256').update(name).digest('hex')}`)
  const onChain = fields => {
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
    Object.entries(fields).forEach(([k, v]) => dict.set(key(k), beginCell().storeUint(0, 8).storeStringTail(v).endCell()))
    return beginCell().storeUint(0, 8).storeDict(dict).endCell()
  }
  const offChain = uri => beginCell().storeUint(1, 8).storeStringTail(uri).endCell()
  const read = cell => getJettonDecimals({
    runMethod: async () => ({ stack: { readBigNumber: () => 0n, readNumber: () => 0, readAddress: () => null, readCell: () => cell } }),
  }, MASTER)
  const res = (status, body = '', location = null) => ({
    ok: status < 300, status, headers: { get: () => location }, json: async () => JSON.parse(body),
  })

  beforeEach(() => fetch.mockReset())

  test.each([['6', 6], ['0', 0]])('on-chain decimals %p is read as %p', async (v, want) => {
    expect(await read(onChain({ decimals: v }))).toBe(want)
  })

  test('on-chain metadata without a decimals key defaults to 9', async () => {
    expect(await read(onChain({ name: 'x' }))).toBe(9)
  })

  test.each(['abc', '6.0', '256'])('on-chain decimals %p is refused instead of guessed', async v => {
    await expect(read(onChain({ decimals: v }))).rejects.toThrow(/Refusing to guess/)
  })

  test.each([
    ['network error', () => Promise.reject(new Error('ECONNRESET'))],
    ['HTTP 500', () => Promise.resolve(res(500))],
    ['JSON without decimals', () => Promise.resolve(res(200, '{"name":"x"}'))],
    ['redirect response', () => Promise.resolve(res(302, '', 'http://127.0.0.1/meta'))],
  ])('off-chain %s is refused', async (_, impl) => {
    fetch.mockImplementation(impl)
    await expect(read(offChain(URI))).rejects.toThrow(/Refusing to guess/)
  })

  test('off-chain decimals are read from the metadata JSON', async () => {
    fetch.mockResolvedValue(res(200, '{"decimals":"6"}'))
    expect(await read(offChain(URI))).toBe(6)
  })

  test('a non-https metadata URI is refused before any request', async () => {
    await expect(read(offChain('http://meta.example/m.json'))).rejects.toThrow(/not a public HTTPS/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
