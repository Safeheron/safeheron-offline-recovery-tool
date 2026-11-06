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
  const { Connection, PublicKey, TransactionMessage } = require('@solana/web3.js')
  const spl = require('@solana/spl-token')
  const actual = jest.requireActual('@solana/spl-token')
  const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ExtensionType } = spl
  const cfg = {
    receiver: 'JAMGhhCrcmM26pkMN1WBR2yD97AyWcYsXpNDDi4H1EGL',
    amount: '1.5',
    network: 'testnet',
    ftoken: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    privateKey: 'aac52ab8254151d0913ea5fe18c0f0a4b5196e9fad6a3c55d3feea268cd7cb06',
  }
  const sent = []

  // Raw mint account bytes, so unpackMint and extension parsing run for real.
  // `extensions` are [type, data] pairs appended as TLV entries.
  const encodeMint = (decimals, extensions = []) => {
    const base = Buffer.alloc(spl.MINT_SIZE)
    spl.MintLayout.encode({
      mintAuthorityOption: 0,
      mintAuthority: PublicKey.default,
      supply: 0n,
      decimals,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    }, base)
    if (extensions.length === 0) return base
    const tlv = extensions.map(([type, data]) => {
      const header = Buffer.alloc(4)
      header.writeUInt16LE(type, 0)
      header.writeUInt16LE(data.length, 2)
      return Buffer.concat([header, data])
    })
    const accountTypeMint = Buffer.from([1])
    return Buffer.concat([base, Buffer.alloc(spl.ACCOUNT_SIZE - spl.MINT_SIZE), accountTypeMint, ...tlv])
  }
  const feeConfig = (basisPoints, maximumFee) => {
    const fee = { epoch: 0n, maximumFee, transferFeeBasisPoints: basisPoints }
    const data = Buffer.alloc(spl.TRANSFER_FEE_CONFIG_SIZE)
    spl.TransferFeeConfigLayout.encode({
      transferFeeConfigAuthority: PublicKey.default,
      withdrawWithheldAuthority: PublicKey.default,
      withheldAmount: 0n,
      olderTransferFee: fee,
      newerTransferFee: fee,
    }, data)
    return [ExtensionType.TransferFeeConfig, data]
  }
  const stubRpc = (decimals, { owner = TOKEN_PROGRAM_ID, extensions } = {}) => {
    const data = Number.isInteger(decimals) ? encodeMint(decimals, extensions) : Buffer.alloc(0)
    jest.spyOn(Connection.prototype, 'getAccountInfo')
      .mockResolvedValue(owner && { owner, data, lamports: 1, executable: false })
    jest.spyOn(Connection.prototype, 'getEpochInfo').mockResolvedValue({ epoch: 500 })
    jest.spyOn(Connection.prototype, 'getLatestBlockhash')
      .mockResolvedValue({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 })
    jest.spyOn(Connection.prototype, 'sendTransaction').mockImplementation(async tx => { sent.push(tx); return 'sig' })
    jest.spyOn(Connection.prototype, 'confirmTransaction').mockResolvedValue({ value: { err: null } })
    spl.getAccount.mockResolvedValue({})
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  }
  const sentInstruction = () => TransactionMessage.decompile(sent[0].message).instructions[1]
  afterEach(() => {
    jest.restoreAllMocks()
    spl.getAccount.mockImplementation(actual.getAccount)
    spl.getAccount.mockClear()
    sent.length = 0
  })

  test('sends TransferChecked to the legacy program carrying the mint decimals', async () => {
    stubRpc(6)
    await ftTransfer(cfg)
    const ix = sentInstruction()
    const { data } = spl.decodeTransferCheckedInstruction(ix)
    expect(ix.programId.equals(TOKEN_PROGRAM_ID)).toBe(true)
    expect([data.decimals, data.amount]).toEqual([6, 1500000n])
  })

  test('keeps a zero-decimal mint transferable', async () => {
    stubRpc(0)
    await ftTransfer({ ...cfg, amount: '3' })
    expect(spl.decodeTransferCheckedInstruction(sentInstruction()).data.amount).toBe(3n)
  })

  test('aborts before sending when the mint is unreadable or not a token mint', async () => {
    stubRpc(undefined)
    await expect(ftTransfer(cfg)).rejects.toThrow()
    stubRpc(6, { owner: PublicKey.default })
    await expect(ftTransfer(cfg)).rejects.toThrow(/not a token mint/)
    expect(sent).toEqual([])
  })

  test('targets Token-2022 and its ATAs for a Token-2022 mint', async () => {
    stubRpc(6, { owner: TOKEN_2022_PROGRAM_ID })
    await ftTransfer(cfg)
    const { keys } = spl.decodeTransferCheckedInstruction(sentInstruction(), TOKEN_2022_PROGRAM_ID)
    const expectedDest = spl.getAssociatedTokenAddressSync(
      new PublicKey(cfg.ftoken), new PublicKey(cfg.receiver), false, TOKEN_2022_PROGRAM_ID)
    expect(keys.destination.pubkey.equals(expectedDest)).toBe(true)
    expect(spl.getAccount.mock.calls[0][3].equals(TOKEN_2022_PROGRAM_ID)).toBe(true)
  })

  test('leaves Token-2022 extensions it does not handle to the chain', async () => {
    stubRpc(6, {
      owner: TOKEN_2022_PROGRAM_ID,
      extensions: [[ExtensionType.MetadataPointer, Buffer.alloc(64)], [ExtensionType.PermanentDelegate, Buffer.alloc(32)]],
    })
    await ftTransfer(cfg)
    expect(spl.decodeTransferCheckedInstruction(sentInstruction(), TOKEN_2022_PROGRAM_ID).data.amount).toBe(1500000n)
  })

  test('charges the transfer fee and prints fee and net amount', async () => {
    // 1.5 tokens at 1% = 0.015, capped at 0.01 by maximumFee.
    stubRpc(6, { owner: TOKEN_2022_PROGRAM_ID, extensions: [feeConfig(100, 10000n)] })
    await ftTransfer(cfg)
    const { data } = spl.decodeTransferCheckedWithFeeInstruction(sentInstruction(), TOKEN_2022_PROGRAM_ID)
    expect([data.amount, data.fee, data.decimals]).toEqual([1500000n, 10000n, 6])
    expect(console.log).toHaveBeenCalledWith('Token-2022 transfer fee: 0.01, receiver gets 1.49')
  })
})

test('handleException appends program logs from the chain error when present', () => {
  const { handleException } = require('../solana')
  const err = Object.assign(new Error('boom'), {
    transactionMessage: 'Transaction simulation failed',
    transactionError: { logs: ['Program log: Instruction: Transfer', 'Program log: custom error 0x1'] },
  })
  expect(handleException(err)).toBe(
    'Transaction simulation failed\nProgram log: Instruction: Transfer\nProgram log: custom error 0x1'
  )
  expect(handleException(new Error('plain'))).toBe('plain')
})
