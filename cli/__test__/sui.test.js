/**
 * @jest-environment node
 */
import { expect, test } from '@jest/globals'

import { transfer, ftTransfer } from '../sui'

test('transfer sui', async () => {
  await expect(transfer({
    receiver: '0x7921a7993ed2b9ed37359cb11e74af7e9422ffb2b2b580dc07e840c5578f3924',
    amount: '0.00001',
    privateKey: '9c7db8d45be532bb6ab003c77c1a84770dd8aacb268b31e66de2f67e07f45303',
    network: 'testnet',
  })).resolves.not.toThrow()
})

test('transfer USDT token', async () => {
  await expect(ftTransfer({
    receiver: '0x7921a7993ed2b9ed37359cb11e74af7e9422ffb2b2b580dc07e840c5578f3924',
    amount: '0.00001',
    privateKey: '9c7db8d45be532bb6ab003c77c1a84770dd8aacb268b31e66de2f67e07f45303',
    network: 'testnet',
    ftoken: '0x5378a0e7495723f7d942366a125a6556cf56f573fa2bb7171b554a2986c4229a::usdt::USDT',
  })).resolves.not.toThrow()
})
