/**
 * @jest-environment node
 */
import { expect, test, describe, afterEach, jest } from '@jest/globals'

import { transfer, ftTransfer } from '../solana'

test('transfer sol', async () => {
  await expect(transfer({
    receiver: 'JAMGhhCrcmM26pkMN1WBR2yD97AyWcYsXpNDDi4H1EGL',
    amount: '0.000001',
    privateKey: 'aac52ab8254151d0913ea5fe18c0f0a4b5196e9fad6a3c55d3feea268cd7cb06',
    network: 'testnet',
  })).resolves.not.toThrow()
})

test('transfer USDC-Dev', async () => {
  await expect(ftTransfer({
    receiver: 'JAMGhhCrcmM26pkMN1WBR2yD97AyWcYsXpNDDi4H1EGL',
    amount: '0.00001',
    privateKey: 'aac52ab8254151d0913ea5fe18c0f0a4b5196e9fad6a3c55d3feea268cd7cb06',
    network: 'testnet',
    ftoken: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
  })).resolves.not.toThrow()
})

// Offline cases: the RPC methods are stubbed on Connection and the sent
// transaction is decoded to check the instruction that was built.
jest.mock('@solana/spl-token', () => {
  const actual = jest.requireActual('@solana/spl-token')
  return { ...actual, getAccount: jest.fn(actual.getAccount) }
})

describe('token transfer instruction offline', () => {
  const { Connection, TransactionMessage } = require('@solana/web3.js')
  const spl = require('@solana/spl-token')
  const actual = jest.requireActual('@solana/spl-token')
  const cfg = {
    receiver: 'JAMGhhCrcmM26pkMN1WBR2yD97AyWcYsXpNDDi4H1EGL',
    amount: '1.5',
    network: 'testnet',
    ftoken: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    privateKey: 'aac52ab8254151d0913ea5fe18c0f0a4b5196e9fad6a3c55d3feea268cd7cb06',
  }
  const sent = []
  const stubRpc = decimals => {
    jest.spyOn(Connection.prototype, 'getParsedAccountInfo')
      .mockResolvedValue({ value: decimals && { data: { parsed: { info: { decimals } } } } })
    jest.spyOn(Connection.prototype, 'getLatestBlockhash')
      .mockResolvedValue({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 })
    jest.spyOn(Connection.prototype, 'sendTransaction').mockImplementation(async tx => { sent.push(tx); return 'sig' })
    jest.spyOn(Connection.prototype, 'confirmTransaction').mockResolvedValue({ value: { err: null } })
    spl.getAccount.mockResolvedValue({})
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  }
  afterEach(() => {
    jest.restoreAllMocks()
    spl.getAccount.mockImplementation(actual.getAccount)
    sent.length = 0
  })

  test('sends TransferChecked carrying the mint decimals, so a lying RPC is rejected on chain', async () => {
    stubRpc(6)
    await ftTransfer(cfg)
    const ix = TransactionMessage.decompile(sent[0].message).instructions[1]
    const { data } = spl.decodeTransferCheckedInstruction(ix)
    expect([data.decimals, data.amount]).toEqual([6, 1500000n])
  })

  test('aborts before sending when the mint precision is unavailable', async () => {
    stubRpc(undefined)
    await expect(ftTransfer(cfg)).rejects.toThrow(/precision/)
    expect(sent).toEqual([])
  })
})
