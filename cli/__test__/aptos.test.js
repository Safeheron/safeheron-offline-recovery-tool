/**
 * @jest-environment node
 */
import { expect, test } from '@jest/globals'

import { transfer, ftTransfer } from '../aptos'

test('transfer apt', async () => {
  await expect(transfer({
    receiver: '0x4a1bdbd47754cef11c46aceb1a52d096e9b6d9cf3ef8f7075d8f134608217550',
    amount: '0.00001',
    privateKey: 'aac52ab8254151d0913ea5fe18c0f0a4b5196e9fad6a3c55d3feea268cd7cb06',
    network: 'testnet',
  })).resolves.not.toThrow()
})

test('transfer USDT token', async () => {
  await expect(ftTransfer({
    receiver: '0x7921a7993ed2b9ed37359cb11e74af7e9422ffb2b2b580dc07e840c5578f3924',
    amount: '0.00001',
    privateKey: 'aac52ab8254151d0913ea5fe18c0f0a4b5196e9fad6a3c55d3feea268cd7cb06',
    network: 'testnet',
    ftoken: '0x43417434fd869edee76cca2a4d2301e528a1551b1d719b75c350c3c97d15b8b9::coins::USDT',
  })).rejects.toThrow('not support')
})
