/**
 * @jest-environment node
 */
import { expect, test } from '@jest/globals'

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
