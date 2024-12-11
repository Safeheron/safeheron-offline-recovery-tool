/**
 * @jest-environment node
 */
import { expect, test } from '@jest/globals'

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
